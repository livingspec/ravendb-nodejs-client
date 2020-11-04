import {IDisposable} from "../../Types/Contracts";
import {DocumentType} from "../DocumentAbstractions";
import {getLogger} from "../../Utility/LogUtil";
import {DocumentStore} from "../DocumentStore";
import {SubscriptionWorkerOptions} from "./SubscriptionWorkerOptions";
import {SubscriptionBatch} from "./SubscriptionBatch";
import {Socket} from "net";
import {StringUtil} from "../../Utility/StringUtil";
import {getError, throwError, RavenErrorType} from "../../Exceptions";
import {TcpUtils} from "../../Utility/TcpUtils";
import * as stream from "readable-stream";
import {TcpNegotiateParameters} from "../../ServerWide/Tcp/TcpNegotiateParameters";
import {
    SUBSCRIPTION_TCP_VERSION,
    SupportedFeatures,
    TcpConnectionHeaderMessage
} from "../../ServerWide/Tcp/TcpConnectionHeaderMessage";
import {OUT_OF_RANGE_STATUS, TcpNegotiation} from "../../ServerWide/Tcp/TcpNegotiation";
import {TcpConnectionHeaderResponse} from "../../ServerWide/Tcp/TcpConnectionHeaderResponse";
import {EventEmitter} from "events";
import {TimeUtil} from "../../Utility/TimeUtil";
import {ObjectUtil} from "../../Utility/ObjectUtil";
import {SubscriptionConnectionServerMessage} from "./SubscriptionConnectionServerMessage";
import {EmptyCallback} from "../../Types/Callbacks";
import {delay} from "../../Utility/PromiseUtil";
import {BatchFromServer} from "./BatchFromServer";
import {ServerNode} from "../../Http/ServerNode";
import {RequestExecutor} from "../../Http/RequestExecutor";
import {GetTcpInfoCommand, TcpConnectionInfo} from "../../ServerWide/Commands/GetTcpInfoCommand";
import {GetTcpInfoForRemoteTaskCommand} from "../Commands/GetTcpInfoForRemoteTaskCommand";
import * as os from "os";
import {StreamingJsonParser} from "../../Utility/StreamingJsonParser";

type EventTypes = "afterAcknowledgment" | "connectionRetry" | "batch" | "error" | "end";

export class SubscriptionWorker<T extends object> implements IDisposable {

    private readonly _documentType: DocumentType<T>;
    private readonly _revisions: boolean;
    private readonly _logger = getLogger({module: "SubscriptionWorker"});
    private readonly _store: DocumentStore;
    private readonly _dbName: string;
    private _processingCanceled = false;
    private readonly _options: SubscriptionWorkerOptions<T>;
    private _tcpClient: Socket;
    private _parser: stream.Transform;
    private _disposed: boolean = false;
    private _subscriptionTask: Promise<void>;
    private _forcedTopologyUpdateAttempts = 0;
    private _emitter = new EventEmitter();

    public constructor(options: SubscriptionWorkerOptions<T>,
                       withRevisions: boolean, documentStore: DocumentStore, dbName: string) {
        this._documentType = options.DocumentType;
        this._options = Object.assign({
            Strategy: "OpenIfFree",
            MaxDocsPerBatch: 4096,
            TimeToWaitBeforeConnectionRetry: 5 * 1000,
            MaxErroneousPeriod: 5 * 60 * 1000
        }, options);
        this._revisions = withRevisions;

        if (StringUtil.isNullOrEmpty(options.SubscriptionName)) {
            throwError("InvalidArgumentException", "SubscriptionConnectionOptions must specify the SubscriptionName");
        }

        this._store = documentStore;
        this._dbName = dbName || documentStore.database;
    }

    public dispose(): void {
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this._processingCanceled = true;

        this._closeTcpClient(); // we disconnect immediately
        if (this._parser) {
            this._parser.end();
        }

        this._subscriptionLocalRequestExecutor?.dispose();
    }

    private _redirectNode: ServerNode;
    private _subscriptionLocalRequestExecutor: RequestExecutor;

    public get currentNodeTag() {
        return this._redirectNode ? this._redirectNode.ClusterTag : null;
    }

    public get subscriptionName() {
        return this._options ? this._options.SubscriptionName : null;
    }

    private async _connectToServer(): Promise<Socket> {
        const command = new GetTcpInfoForRemoteTaskCommand(
            "Subscription/" + this._dbName, this._dbName,
            this._options ? this._options.SubscriptionName : null, true);

        const requestExecutor = this._store.getRequestExecutor(this._dbName);

        let tcpInfo: TcpConnectionInfo;

        if (this._redirectNode) {
            try {
                await requestExecutor.execute(command, null, {
                    chosenNode: this._redirectNode,
                    nodeIndex: null,
                    shouldRetry: false
                });
                tcpInfo = command.result;
            } catch (e) {
                if (e.name === "ClientVersionMismatchException") {
                    tcpInfo = await this._legacyTryGetTcpInfo(requestExecutor, this._redirectNode);
                } else {
                    // if we failed to talk to a node, we'll forget about it and let the topology to
                    // redirect us to the current node

                    this._redirectNode = null;

                    throw e;
                }
            }
        } else {
            try {
                await requestExecutor.execute(command);
                tcpInfo = command.result;

                const tcpInfoUrls = tcpInfo.Urls;

                this._redirectNode = requestExecutor.getTopology().nodes
                    .find(x => tcpInfoUrls.includes(x.Url));
            } catch (e) {
                if (e.name === "ClientVersionMismatchException") {
                    tcpInfo = await this._legacyTryGetTcpInfo(requestExecutor);
                } else {
                    throw e;
                }
            }
        }

        const [socket, chosenUrl] = await TcpUtils.connectWithPriority(tcpInfo, command.result.Certificate, this._store.authOptions);

        this._tcpClient = socket;

        this._ensureParser();

        const databaseName = this._dbName || this._store.database;

        const parameters = {
            database: databaseName,
            operation: "Subscription",
            version: SUBSCRIPTION_TCP_VERSION,
            readResponseAndGetVersionCallback: url => this._readServerResponseAndGetVersion(url),
            destinationNodeTag: this.currentNodeTag,
            destinationUrl: chosenUrl
        } as TcpNegotiateParameters;

        this._supportedFeatures = await TcpNegotiation.negotiateProtocolVersion(this._tcpClient, parameters);

        if (this._supportedFeatures.protocolVersion <= 0) {
            throwError("InvalidOperationException",
                this._options.SubscriptionName
                + " : TCP negotiation resulted with an invalid protocol version: "
                + this._supportedFeatures.protocolVersion);
        }

        await this._sendOptions(this._tcpClient, this._options);

        if (this._subscriptionLocalRequestExecutor) {
            this._subscriptionLocalRequestExecutor.dispose();
        }

        this._subscriptionLocalRequestExecutor = RequestExecutor.createForSingleNodeWithoutConfigurationUpdates(
            command.getRequestedNode().Url,
            this._dbName,
            {
                authOptions: requestExecutor.getAuthOptions(),
                documentConventions: requestExecutor.conventions
            }
        );

        this._store.registerEvents(this._subscriptionLocalRequestExecutor);

        return this._tcpClient;
    }

    private async _legacyTryGetTcpInfo(requestExecutor: RequestExecutor, node?: ServerNode) {
        const tcpCommand = new GetTcpInfoCommand("Subscription/" + this._dbName, this._dbName);
        try {
            if (node) {
                await requestExecutor.execute<TcpConnectionInfo>(tcpCommand, null, {
                    chosenNode: node,
                    shouldRetry: false,
                    nodeIndex: undefined
                });
            } else {
                await requestExecutor.execute(tcpCommand, null);
            }
        } catch (e) {
            this._redirectNode = null;
            throw e;
        }

        return tcpCommand.result;
    }

    private async _sendOptions(socket: Socket, options: SubscriptionWorkerOptions<T>) {
        const payload = {
            SubscriptionName: options.SubscriptionName,
            TimeToWaitBeforeConnectionRetry:
                TimeUtil.millisToTimeSpan(options.TimeToWaitBeforeConnectionRetry),
            IgnoreSubscriberErrors: options.IgnoreSubscriberErrors || false,
            Strategy: options.Strategy,
            MaxDocsPerBatch: options.MaxDocsPerBatch,
            MaxErroneousPeriod:
                TimeUtil.millisToTimeSpan(options.MaxErroneousPeriod),
            CloseWhenNoDocsLeft: options.CloseWhenNoDocsLeft || false,
        };

        return new Promise<number>(resolve => {
            socket.write(JSON.stringify(payload, null, 0), () => resolve());
        });
    }

    private _ensureParser() {
        const jsonObjectStreamer = new StreamingJsonParser([true]);
        this._parser = stream.pipeline(
            [this._tcpClient, jsonObjectStreamer], err => {
                if (err && !this._tcpClient.destroyed) {
                    this._emitter.emit("error", err);
                }
            }) as stream.Transform;

        this._parser.pause();
    }

    // noinspection JSUnusedLocalSymbols
    private async _readServerResponseAndGetVersion(url: string): Promise<number> {
        const x: any = await this._readNextObject();
        switch (x.Status) {
            case "Ok":
                return x.Version;
            case "AuthorizationFailed":
                throwError("AuthorizationException",
                    "Cannot access database " + this._dbName + " because " + x.Message);
                return;
            case "TcpVersionMismatch":
                if (x.Version !== OUT_OF_RANGE_STATUS) {
                    return x.Version;
                }

                //Kindly request the server to drop the connection
                await this._sendDropMessage(x.Value);
                throwError("InvalidOperationException",
                    "Can't connect to database " + this._dbName + " because: " + x.Message);
        }

        return x.Version;
    }

    private _sendDropMessage(reply: TcpConnectionHeaderResponse): Promise<number> {
        const dropMsg = {
            operation: "Drop",
            databaseName: this._dbName,
            operationVersion: SUBSCRIPTION_TCP_VERSION,
            info: "Couldn't agree on subscription tcp version ours: "
                + SUBSCRIPTION_TCP_VERSION + " theirs: " + reply.version
        } as TcpConnectionHeaderMessage;

        const payload = ObjectUtil.transformObjectKeys(dropMsg, {
            defaultTransform: "pascal"
        });

        return new Promise<number>(resolve => {
            this._tcpClient.write(JSON.stringify(payload, null, 0), () => resolve());
        });
    }

    private _assertConnectionState(connectionStatus: SubscriptionConnectionServerMessage) {
        if (connectionStatus.Type === "Error") {
            if (connectionStatus.Exception.includes("DatabaseDoesNotExistException")) {
                throwError("DatabaseDoesNotExistException",
                    this._dbName + " does not exists. " + connectionStatus.Message);
            }
        }

        if (connectionStatus.Type !== "ConnectionStatus") {
            throwError("InvalidOperationException",
                "Server returned illegal type message when expecting connection status, was: " + connectionStatus.Type);
        }

        // noinspection FallThroughInSwitchStatementJS
        switch (connectionStatus.Status) {
            case "Accepted":
                break;
            case "InUse":
                throwError("SubscriptionInUseException",
                    "Subscription with id " + this._options.SubscriptionName
                    + " cannot be opened, because it's in use and the connection strategy is "
                    + this._options.Strategy);
            case "Closed":
                const canReconnect = connectionStatus.Data.CanReconnect || false;
                const subscriptionClosedError = getError("SubscriptionClosedException",
                    "Subscription with id " + this._options.SubscriptionName
                    + " was closed. " + connectionStatus.Exception);
                (subscriptionClosedError as any).canReconnect = canReconnect;
                throw subscriptionClosedError;
            case "Invalid":
                throwError("SubscriptionInvalidStateException",
                    "Subscription with id " + this._options.SubscriptionName
                    + " cannot be opened, because it is in invalid state. " + connectionStatus.Exception);
            case "NotFound":
                throwError("SubscriptionDoesNotExistException",
                    "Subscription with id " + this._options.SubscriptionName
                    + " cannot be opened, because it does not exist. " + connectionStatus.Exception);
            case "Redirect":
                const data = connectionStatus.Data;
                const appropriateNode = data.redirectedTag;
                const reasons = data.reasons;

                const error = getError("SubscriptionDoesNotBelongToNodeException",
                    "Subscription with id " + this._options.SubscriptionName
                    + " cannot be processed by current node, it will be redirected to " + appropriateNode + os.EOL + reasons);
                (error as any).appropriateNode = appropriateNode;
                throw error;
            case "ConcurrencyReconnect":
                throwError("SubscriptionChangeVectorUpdateConcurrencyException", connectionStatus.Message);
            default:
                throwError("InvalidOperationException",
                    "Subscription " + this._options.SubscriptionName
                    + " could not be opened, reason: " + connectionStatus.Status);
        }
    }

    private async _processSubscription() {
        try {
            if (this._processingCanceled) {
                throwError("OperationCanceledException");
            }

            const socket = await this._connectToServer();
            let notifiedSubscriber = Promise.resolve();
            let readFromServer = Promise.resolve<BatchFromServer>(null);
            try {
                if (this._processingCanceled) {
                    throwError("OperationCanceledException");
                }

                const tcpClientCopy = this._tcpClient;
                const connectionStatus: SubscriptionConnectionServerMessage = await this._readNextObject();

                if (this._processingCanceled) {
                    return;
                }

                if (connectionStatus.Type !== "ConnectionStatus" || connectionStatus.Status !== "Accepted") {
                    this._assertConnectionState(connectionStatus);
                }

                this._lastConnectionFailure = null;

                if (this._processingCanceled) {
                    return;
                }

                const batch = new SubscriptionBatch<T>(this._documentType, this._revisions,
                    this._subscriptionLocalRequestExecutor, this._store, this._dbName);

                while (!this._processingCanceled) {
                    // start the read from the server

                    readFromServer = this._readSingleSubscriptionBatchFromServer(batch);

                    try {
                        // and then wait for the subscriber to complete
                        await notifiedSubscriber;
                    } catch (err) {
                        // if the subscriber errored, we shut down
                        this._closeTcpClient();

                        // noinspection ExceptionCaughtLocallyJS
                        throw err;
                    }

                    const incomingBatch = await readFromServer;

                    if (this._processingCanceled) {
                        throwError("OperationCanceledException");
                    }

                    const lastReceivedChangeVector = batch.initialize(incomingBatch);
                    notifiedSubscriber = this._emitBatchAndWaitForProcessing(batch)
                        .catch((err) => {
                            this._logger.error(err, "Subscription " + this._options.SubscriptionName
                                + ". Subscriber threw an exception on document batch");

                            if (!this._options.IgnoreSubscriberErrors) {
                                throwError("SubscriberErrorException",
                                    "Subscriber threw an exception in subscription "
                                    + this._options.SubscriptionName, err);
                            }
                        })
                        .then(() => {
                            if (tcpClientCopy && tcpClientCopy.writable) {
                                return this._sendAck(lastReceivedChangeVector, tcpClientCopy);
                            }
                        });
                }
            } finally {
                socket.end();
                this._parser.end();

                try {
                    await notifiedSubscriber;
                } catch {
                    // we don't care anymore about errors from it
                }

                try {
                    await readFromServer;
                } catch {
                    // we don't care anymore about errors from it
                }
            }
        } catch (err) {
            if (!this._disposed) {
                throw err;
            }

            // otherwise this is thrown when shutting down, it
            // isn't an error, so we don't need to treat
            // it as such
        }
    }

    private async _emitBatchAndWaitForProcessing(batch): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let listenerCount = this._emitter.listenerCount("batch");
            this._emitter.emit("batch", batch, (error?: any) => {
                if (error) {
                    reject(error);
                } else {
                    listenerCount--;
                    if (!listenerCount) {
                        resolve();
                    }
                }
            });
        });
    }

    private async _readSingleSubscriptionBatchFromServer(batch: SubscriptionBatch<T>):
        Promise<BatchFromServer> {
        const incomingBatch = [] as SubscriptionConnectionServerMessage[];
        const includes = [];

        let endOfBatch = false;

        while (!endOfBatch && !this._processingCanceled) {
            const receivedMessage = await this._readNextObject();
            if (!receivedMessage || this._processingCanceled) {
                break;
            }

            switch (receivedMessage.Type) {
                case "Data":
                    incomingBatch.push(receivedMessage);
                    break;
                case "Includes":
                    includes.push(receivedMessage.Includes);
                    break;
                case "EndOfBatch":
                    endOfBatch = true;
                    break;
                case "Confirm":
                    this._emitter.emit("afterAcknowledgment", batch);

                    incomingBatch.length = 0;
                    batch.items.length = 0;
                    break;
                case "ConnectionStatus":
                    this._assertConnectionState(receivedMessage);
                    break;
                case "Error":
                    this._throwSubscriptionError(receivedMessage);
                    break;
                default:
                    this._throwInvalidServerResponse(receivedMessage);
                    break;

            }
        }
        return {
            Messages: incomingBatch,
            Includes: includes
        };
    }

    private _throwInvalidServerResponse(receivedMessage: SubscriptionConnectionServerMessage) {
        throwError("InvalidArgumentException",
            "Unrecognized message " + receivedMessage.Type + " type received from server");
    }

    private _throwSubscriptionError(receivedMessage: SubscriptionConnectionServerMessage) {
        throwError("InvalidOperationException",
            "Connection terminated by server. Exception: " + (receivedMessage.Exception || "None"));
    }

    private async _readNextObject(): Promise<SubscriptionConnectionServerMessage> {
        const stream: NodeJS.ReadableStream = this._parser;
        if (this._processingCanceled) {
            return null;
        }

        if (this._disposed) { // if we are disposed, nothing to do...
            return null;
        }

        if (stream.readable) {
            const data = stream.read() as any;
            if (data) {
                return data;
            }
        }

        return new Promise((resolve, reject) => {
            stream.once("readable", readableListener);
            stream.once("error", errorHandler);
            stream.once("end", endHandler);

            function readableListener() {
                stream.removeListener("error", errorHandler);
                stream.removeListener("end", endHandler);
                resolve();
            }

            function errorHandler(err) {
                stream.removeListener("readable", readableListener);
                stream.removeListener("end", endHandler);
                reject(err);
            }

            function endHandler() {
                stream.removeListener("readable", readableListener);
                stream.removeListener("error", errorHandler);
                reject(getError("SubscriptionException", "Subscription stream has ended unexpectedly."));
            }
        })
            .then(() => this._readNextObject());
    }

    private async _sendAck(lastReceivedChangeVector: string, networkStream: Socket): Promise<void> {
        const payload = {
            ChangeVector: lastReceivedChangeVector,
            Type: "Acknowledge"
        };

        return new Promise<void>((resolve, reject) => {
            networkStream.write(JSON.stringify(payload, null, 0), (err) => {
                err ? reject(err) : resolve();
            });
        });
    }

    private async _runSubscriptionAsync(): Promise<void> {
        while (!this._processingCanceled) {
            try {
                this._closeTcpClient();

                this._logger.info("Subscription " + this._options.SubscriptionName + ". Connecting to server...");
                await this._processSubscription();
            } catch (error) {
                if (this._processingCanceled) {
                    if (!this._disposed) {
                        throw error;
                    }
                    return;
                }

                this._logger.warn(error, "Subscription "
                    + this._options.SubscriptionName + ". Pulling task threw the following exception. ");

                if (this._shouldTryToReconnect(error)) {
                    await delay(this._options.TimeToWaitBeforeConnectionRetry);

                    if (!this._redirectNode) {
                        const reqEx = this._store.getRequestExecutor(this._dbName);
                        const curTopology = reqEx.getTopologyNodes();
                        const nextNodeIndex = (this._forcedTopologyUpdateAttempts++) % curTopology.length;
                        this._redirectNode = curTopology[nextNodeIndex];

                        this._logger.info("Subscription " + this._options.SubscriptionName + ". Will modify redirect node from null to " + this._redirectNode.ClusterTag);
                    }

                    this._emitter.emit("connectionRetry", error);
                } else {
                    this._logger.error(error, "Connection to subscription "
                        + this._options.SubscriptionName + " have been shut down because of an error.");

                    throw error;
                }
            }
        }
    }

    private _lastConnectionFailure: Date;
    private _supportedFeatures: SupportedFeatures;

    private _assertLastConnectionFailure(lastError: Error) {
        if (!this._lastConnectionFailure) {
            this._lastConnectionFailure = new Date();
            return;
        }

        const maxErroneousPeriod = this._options.MaxErroneousPeriod;
        const erroneousPeriodDuration = new Date().getTime() - this._lastConnectionFailure.getTime();
        if (erroneousPeriodDuration > maxErroneousPeriod) {
            throwError("SubscriptionInvalidStateException",
                "Subscription connection was in invalid state for more than "
                + maxErroneousPeriod + " and therefore will be terminated.", lastError);
        }
    }

    private _shouldTryToReconnect(ex: Error) {
        if (ex.name === ("SubscriptionDoesNotBelongToNodeException" as RavenErrorType)) {
            this._assertLastConnectionFailure(ex);

            const requestExecutor = this._store.getRequestExecutor(this._dbName);

            const appropriateNode = (ex as any).appropriateNode;
            if (!appropriateNode) {
                this._redirectNode = null;
                return true;
            }

            const nodeToRedirectTo = requestExecutor.getTopologyNodes()
                .find(x => x.ClusterTag === appropriateNode);

            if (!nodeToRedirectTo) {
                throwError("InvalidOperationException",
                    "Could not redirect to " + appropriateNode
                    + ", because it was not found in local topology, even after retrying");
            }

            this._redirectNode = nodeToRedirectTo;
            return true;
        } else if (ex.name === "NodeIsPassiveException") {
            // if we failed to talk to a node, we'll forget about it and let the topology to
            // redirect us to the current node
            this._redirectNode = null;
            return true;
        } else if (ex.name === "SubscriptionChangeVectorUpdateConcurrencyException") {
            return true;
        } else if (ex.name === "SubscriptionClosedException") {
            if ((ex as any).canReconnect) {
                return true;
            }

            this._processingCanceled = true;
            return false;
        }

        if (ex.name === "SubscriptionInUseException"
            || ex.name === "SubscriptionDoesNotExistException"
            || ex.name === "SubscriptionInvalidStateException"
            || ex.name === "DatabaseDoesNotExistException"
            || ex.name === "AuthorizationException"
            || ex.name === "AllTopologyNodesDownException"
            || ex.name === "SubscriberErrorException") {
            this._processingCanceled = true;
            return false;
        }

        this._assertLastConnectionFailure(ex);
        return true;
    }

    private _closeTcpClient() {
        if (this._tcpClient) {
            this._tcpClient.end();
        }
    }

    public on(event: "batch",
              handler: (value: SubscriptionBatch<T>, callback: EmptyCallback) => void);
    public on(event: "error",
              handler: (error?: Error) => void);
    public on(event: "end",
              handler: (error?: Error) => void);
    public on(event: "afterAcknowledgment",
              handler: (value: SubscriptionBatch<T>, callback: EmptyCallback) => void);
    public on(event: "connectionRetry",
              handler: (error?: Error) => void);
    public on(event: EventTypes,
              handler:
                  ((batchOrError: SubscriptionBatch<T>, callback: EmptyCallback) => void)
                  | ((error: Error) => void)) {
        this._emitter.on(event, handler);

        if (event === "batch" && !this._subscriptionTask) {
            this._subscriptionTask = this._runSubscriptionAsync()
                .catch(err => {
                    this._emitter.emit("error", err);
                })
                .then(() => {
                    this._emitter.emit("end");
                });
        }

        return this;
    }

    public off(event: "batch", handler: (value: SubscriptionBatch<T>, callback: EmptyCallback) => void);
    public off(event: "error", handler: (error?: Error) => void);
    public off(event: "end", handler: (error?: Error) => void);
    public off(event: "afterAcknowledgment", handler: (value: SubscriptionBatch<T>, callback: EmptyCallback) => void);
    public off(event: "connectionRetry", handler: (error?: Error) => void);
    public off(event: EventTypes,
               handler:
                   ((batchOrError: SubscriptionBatch<T>, callback: EmptyCallback) => void)
                   | ((error: Error) => void)) {
        this._emitter.removeListener(event, handler);
        return this;
    }

    public removeListener(event: "batch", handler: (value: SubscriptionBatch<T>, callback: EmptyCallback) => void);
    public removeListener(event: "error", handler: (error?: Error) => void);
    public removeListener(event: "end", handler: (error?: Error) => void);
    public removeListener(
        event: "afterAcknowledgment", handler: (value: SubscriptionBatch<T>, callback: EmptyCallback) => void);
    public removeListener(event: "connectionRetry", handler: (error?: Error) => void);
    public removeListener(
        event: EventTypes,
        handler:
            ((batchOrError: SubscriptionBatch<T>, callback: EmptyCallback) => void)
            | ((error: Error) => void)) {
        this.removeListener(event as any, handler as any);
        return this;
    }

}
