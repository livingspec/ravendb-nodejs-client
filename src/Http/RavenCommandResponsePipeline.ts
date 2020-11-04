import {EventEmitter} from "events";
import {
    ObjectKeyCaseTransformStreamOptions,
    ObjectKeyCaseTransformStream
} from "../Mapping/Json/Streams/ObjectKeyCaseTransformStream";
import {
    ObjectKeyCaseTransformProfile,
    getObjectKeyCaseTransformProfile
} from "../Mapping/Json/Conventions";
import {CasingConvention} from "../Utility/ObjectUtil";
import * as StreamUtil from "../Utility/StreamUtil";
import * as stream from "readable-stream";
import {
    CollectResultStream,
    CollectResultStreamOptions,
    lastChunk
} from "../Mapping/Json/Streams/CollectResultStream";
import {throwError, getError} from "../Exceptions";
import * as StringBuilder from "string-builder";
import {TypeUtil} from "../Utility/TypeUtil";
import {DocumentConventions} from "../Documents/Conventions/DocumentConventions";
import {ErrorFirstCallback} from "../Types/Callbacks";
import {StreamingJsonParser} from "../Utility/StreamingJsonParser";

export interface RavenCommandResponsePipelineOptions<TResult> {
    collectBody?: boolean | ((body: string) => void);
    streamResponse?: boolean;
    streamResultsAsObjects?: boolean;
    jsonSync?: boolean;
    includeStatistics?: boolean;
    streamKeyCaseTransform?: ObjectKeyCaseTransformStreamOptions;
    collectResult: CollectResultStreamOptions<TResult>;
    transform?: stream.Stream;
}

export class RavenCommandResponsePipeline<TStreamResult> extends EventEmitter {

    private readonly _opts: RavenCommandResponsePipelineOptions<TStreamResult>;
    private _body: StringBuilder = new StringBuilder();

    private constructor() {
        super();
        this._opts = {} as RavenCommandResponsePipelineOptions<TStreamResult>;
    }

    public static create<TResult>(): RavenCommandResponsePipeline<TResult> {
        return new RavenCommandResponsePipeline();
    }

    public parseJsonResultsStream(includeStatistics: boolean) {
        this._opts.streamResultsAsObjects = true;
        this._opts.includeStatistics = includeStatistics;
        return this;
    }

    public streamResponse() {
        this._opts.streamResponse = true;
        return this;
    }

    public parseJsonSync() {
        this._opts.jsonSync = true;
        return this;
    }

    public collectBody(callback?: (body: string) => void) {
        this._opts.collectBody = callback || true;
        return this;
    }

    public collectResult(
        reduce: (result: TStreamResult, next: object) => TStreamResult,
        init: TStreamResult): RavenCommandResponsePipeline<TStreamResult>;
    public collectResult(opts: CollectResultStreamOptions<TStreamResult>): RavenCommandResponsePipeline<TStreamResult>;
    public collectResult(
        optsOrReduce:
            CollectResultStreamOptions<TStreamResult> | ((result: TStreamResult, next: object) => TStreamResult),
        init?: TStreamResult): RavenCommandResponsePipeline<TStreamResult> {
        if (typeof optsOrReduce === "function") {
            this._opts.collectResult = {reduceResults: optsOrReduce, initResult: init};
        } else {
            this._opts.collectResult = optsOrReduce;
        }

        return this;
    }

    public stream(src: stream.Stream): stream.Readable;
    public stream(src: stream.Stream, dst: stream.Writable, callback: ErrorFirstCallback<void>): stream.Stream;
    public stream(src: stream.Stream, dst?: stream.Writable, callback?: ErrorFirstCallback<void>): stream.Stream {
        const streams = this._buildUp(src);
        if (dst) {
            streams.push(dst);
        }

        return (stream.pipeline as any)(...streams, callback || TypeUtil.NOOP) as stream.Stream;
    }

    private _appendBody(s): void {
        this._body.append(s);
    }

    private _buildUp(src: stream.Stream) {
        if (!src) {
            throwError("MappingError", "Body stream cannot be null.");
        }

        const opts = this._opts;
        const streams: stream.Stream[] = [src];
        if (opts.collectBody) {
            src.on("data", (chunk) => this._appendBody(chunk));
        }

        if (opts.streamResponse) {
            // response pass-through stream; no result parsing
        } else if (opts.streamResultsAsObjects) {
            const resultsStreamer = new StreamingJsonParser([true, "Results", true]);
            if (opts.includeStatistics) {
                let statistics = {};
                resultsStreamer.on('header', (data) => Object.assign(statistics, data));
                resultsStreamer.on('footer', (data) => Object.assign(statistics, data));
                resultsStreamer.on('end', () => src.emit("accumulateStats", statistics));
            }
            streams.push(resultsStreamer);
        } else if (opts.jsonSync) {
            let json = "";
            const parseJsonSyncTransform = new stream.Transform({
                readableObjectMode: true,
                transform(chunk, enc, callback) {
                    json += chunk.toString("utf8");
                    callback();
                },
                flush(callback) {
                    try {
                        callback(null, JSON.parse(json));
                    } catch (err) {
                        callback(
                            getError("InvalidOperationException", `Error parsing response: '${json}'.`, err));
                    }
                }
            });
            streams.push(parseJsonSyncTransform);
        }

        return streams;
    }

    public process(src: stream.Stream): Promise<TStreamResult> {
        const streams = this._buildUp(src);
        const opts = this._opts;
        let resultPromise: Promise<TStreamResult>;
        if (!opts.streamResultsAsObjects) {
            const collectResultOpts = !opts.collectResult || !opts.collectResult.reduceResults
                ? {reduceResults: lastChunk as any} : opts.collectResult;
            const collectResult = new CollectResultStream(collectResultOpts);
            streams.push(collectResult);
            resultPromise = collectResult.promise;
        }

        if (opts.collectBody) {
            resultPromise
                .then(() => {
                    const body = this._body.toString();
                    this.emit("body", body);
                    if (typeof opts.collectBody === "function") {
                        opts.collectBody(body);
                    }
                });
        }

        return StreamUtil.pipelineAsync(...streams)
            .then(() => resultPromise);
    }
}
