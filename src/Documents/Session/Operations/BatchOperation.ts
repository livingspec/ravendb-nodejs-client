import { InMemoryDocumentSessionOperations } from "../InMemoryDocumentSessionOperations";
import { throwError } from "../../../Exceptions";
import { CONSTANTS } from "../../../Constants";
import { SessionAfterSaveChangesEventArgs } from "../SessionEvents";
import { DocumentInfo } from "../DocumentInfo";
import { ActionsToRunOnSuccess, CommandType } from "../../Commands/CommandData";
import { CaseInsensitiveKeysMap } from "../../../Primitives/CaseInsensitiveKeysMap";
import { PatchStatus } from "../../Operations/PatchStatus";
import { CounterTracking } from "../CounterInternalTypes";
import { TypeUtil } from "../../../Utility/TypeUtil";
import { BatchCommandResult } from "./BatchCommandResult";
import { ObjectUtil } from "../../../Utility/ObjectUtil";
import { ClusterWideBatchCommand } from "../../Commands/Batches/ClusterWideBatchCommand";
import { SingleNodeBatchCommand } from "../../Commands/Batches/SingleNodeBatchCommand";

export class BatchOperation {

    private readonly _session: InMemoryDocumentSessionOperations;

    public constructor(session: InMemoryDocumentSessionOperations) {
        this._session = session;
    }

    private _entities: object[];
    private _sessionCommandsCount: number;
    private _allCommandsCount: number;
    private _onSuccessfulRequest: ActionsToRunOnSuccess;

    private _modifications: Map<string, DocumentInfo>;

    public createRequest(): SingleNodeBatchCommand {
        const result = this._session.prepareForSaveChanges();

        this._onSuccessfulRequest = result.onSuccess;
        this._sessionCommandsCount = result.sessionCommands.length;
        result.sessionCommands.push(...result.deferredCommands);
        
        this._session.validateClusterTransaction(result);
        
        this._allCommandsCount = result.sessionCommands.length;
        if (this._allCommandsCount === 0) {
            return null;
        }

        this._session.incrementRequestCount();

        this._entities = result.entities;

        if (this._session.transactionMode === "ClusterWide") {
            return new ClusterWideBatchCommand(this._session.conventions, result.sessionCommands, result.options);
        }
        return new SingleNodeBatchCommand(this._session.conventions, result.sessionCommands, result.options);
    }

    private static _throwOnNullResults() {
        throwError("InvalidOperationException",
            "Received empty response from the server. This is not supposed to happen and is likely a bug.");
    }

    public setResult(result: BatchCommandResult): void {

        if (!result.Results) {
            BatchOperation._throwOnNullResults();
            return;
        }

        this._onSuccessfulRequest.clearSessionStateAfterSuccessfulSaveChanges();

        if (this._session.transactionMode === "ClusterWide") {
            if (result.TransactionIndex <= 0) {
                throwError(
                    "ClientVersionMismatchException",
                    "Cluster transaction was send to a node that is not supporting it. " 
                    + "So it was executed ONLY on the requested node on " 
                    + this._session.requestExecutor.getUrl());
            }
        }

        const results = result.Results;
        for (let i = 0; i < this._sessionCommandsCount; i++) {
            const batchResult = results[i];
            if (!batchResult) {
                continue;
            }

            const type = getCommandType(batchResult);

            switch (type) {
                case "PUT":
                    this._handlePut(i, batchResult, false);
                    break;
                case "ForceRevisionCreation":
                    this._handleForceRevisionCreation(batchResult);
                    break;
                case "DELETE":
                    this._handleDelete(batchResult);
                    break;
                case "CompareExchangePUT":
                case "CompareExchangeDELETE":
                    break;
                default:
                    throwError("InvalidOperationException", `Command '${type}' is not supported.`);
            }
        }

        for (let i = this._sessionCommandsCount; i < this._allCommandsCount; i++) {
            const batchResult = result.Results[i];
            if (!batchResult) {
                continue;
            }

            const type = getCommandType(batchResult);
            switch (type) {
                case "PUT":
                    this._handlePut(i, batchResult, true);
                    break;
                case "DELETE":
                    this._handleDelete(batchResult);
                    break;
                case "PATCH":
                    this._handlePatch(batchResult);
                    break;
                case "AttachmentPUT":
                    this._handleAttachmentPut(batchResult);
                    break;
                case "AttachmentDELETE":
                    this._handleAttachmentDelete(batchResult);
                    break;
                case "AttachmentMOVE":
                    this._handleAttachmentMove(batchResult);
                    break;
                case "AttachmentCOPY":
                    this._handleAttachmentCopy(batchResult);
                    break;
                case "CompareExchangePUT":
                case "CompareExchangeDELETE":
                case "ForceRevisionCreation":
                    break;
                case "Counters":
                    this._handleCounters(batchResult);
                    break;
                case "BatchPATCH":
                    break;
                default:
                    throwError("InvalidOperationException", `Command '${type}' is not supported.`);
            }
        }

        this._finalizeResults();
    }

    private _finalizeResults(): void {
        if (!this._modifications) {
            return;
        }

        for (const [ id, docInfo ] of this._modifications.entries()) {
            this._applyMetadataModifications(id, docInfo);
        }
    }
    
    private _applyMetadataModifications(id: string, documentInfo: DocumentInfo): void {
        documentInfo.metadataInstance = null;
        documentInfo.metadata = ObjectUtil.clone(documentInfo.metadata);

        documentInfo.metadata["@change-vector"] = documentInfo.ChangeVector;

        const documentCopy = ObjectUtil.clone(documentInfo.document);
        documentCopy[CONSTANTS.Documents.Metadata.KEY] = documentInfo.metadata;

        documentInfo.document = documentCopy;
    }
    
    private _getOrAddModifications(
        id: string, documentInfo: DocumentInfo, applyModifications: boolean): DocumentInfo {
        if (!this._modifications) {
            this._modifications = CaseInsensitiveKeysMap.create<DocumentInfo>();
        }
        
        let modifiedDocumentInfo = this._modifications.get(id);
        if (modifiedDocumentInfo) {
            if (applyModifications) {
                this._applyMetadataModifications(id, modifiedDocumentInfo);
            }
        } else {
            modifiedDocumentInfo = documentInfo;
            this._modifications.set(id, documentInfo);
        }
        
        return modifiedDocumentInfo;
    }

    private _handleAttachmentCopy(batchResult: object): void {
        this._handleAttachmentPutInternal(batchResult, "AttachmentCOPY", "Id", "Name", "DocumentChangeVector");
    }

    private _handleAttachmentMove(batchResult: object): void {
        this._handleAttachmentDeleteInternal(batchResult, "AttachmentMOVE", "Id", "Name", "DocumentChangeVector");
        this._handleAttachmentPutInternal(batchResult, "AttachmentMOVE", "DestinationId", "DestinationName", "DocumentChangeVector");
    }

    private _handleAttachmentDelete(batchResult: object): void {
        this._handleAttachmentDeleteInternal(
            batchResult, "AttachmentDELETE", CONSTANTS.Documents.Metadata.ID, "Name", "DocumentChangeVector");
    }

    private _handleAttachmentDeleteInternal(
        batchResult: object, type: CommandType, idFieldName: string, attachmentNameFieldName: string, documentChangeVectorFieldName: string) {
        const id = BatchOperation._getStringField(batchResult, type, idFieldName);
        const sessionDocumentInfo = this._session.documentsById.getValue(id);
        if (!sessionDocumentInfo) {
            return;
        }

        const documentInfo = this._getOrAddModifications(id, sessionDocumentInfo, true);

        const documentChangeVector = BatchOperation._getStringField(batchResult, type, documentChangeVectorFieldName, false);
        if (documentChangeVector) {
            documentInfo.ChangeVector = documentChangeVector;
        }

        const attachmentsJson = documentInfo.metadata["@attachments"];
        if (!attachmentsJson || !Object.keys(attachmentsJson).length) {
            return;
        }

        const name = BatchOperation._getStringField(batchResult, type, attachmentNameFieldName);
        const attachments = [];
        documentInfo.metadata["@attachments"] = attachments;
        for (const attachment of attachmentsJson) {
            const attachmentName = BatchOperation._getStringField(attachment, type, "Name");
            if (attachmentName === name) {
                continue;
            }
            
            attachments.push(attachment);
        }
    }

    private _handleAttachmentPut(batchResult: object): void {
        this._handleAttachmentPutInternal(
            batchResult, "AttachmentPUT", "Id", "Name", "DocumentChangeVector");
    }

    private _handleAttachmentPutInternal(
        batchResult: object, type: CommandType, idFieldName: string, attachmentNameFieldName: string, documentChangeVectorFieldName: string): void {
        const id = BatchOperation._getStringField(batchResult, type, idFieldName);
        const sessionDocumentInfo = this._session.documentsById.getValue(id);
        if (!sessionDocumentInfo) {
            return;
        }

        const documentInfo = this._getOrAddModifications(id, sessionDocumentInfo, false);
        const documentChangeVector = BatchOperation._getStringField(batchResult, type, documentChangeVectorFieldName, false);
        if (documentChangeVector) {
            documentInfo.ChangeVector = documentChangeVector;
        }

        let attachments = documentInfo.metadata["@attachments"];
        if (!attachments) {
            attachments = [];
            documentInfo.metadata["@attachments"] = attachments;
        }

        attachments.push({
            ChangeVector: BatchOperation._getStringField(batchResult, type, "ChangeVector"),
            ContentType: BatchOperation._getStringField(batchResult, type, "ContentType"),
            Hash: BatchOperation._getStringField(batchResult, type, "Hash"),
            Name: BatchOperation._getStringField(batchResult, type, "Name"),
            Size: BatchOperation._getNumberField(batchResult, type, "Size")
        });
    }

    private _handlePatch(batchResult: object): void {
        const status = batchResult["PatchStatus"] as PatchStatus;
        if (!status) {
            BatchOperation._throwMissingField("PATCH", "PatchStatus");
        }

        switch (status) {
            case "Created":
            case "Patched":
                const document = batchResult["ModifiedDocument"];
                if (!document) {
                    return;
                }

                const id = BatchOperation._getStringField(batchResult, "PUT", "Id");
                const sessionDocumentInfo = this._session.documentsById.getValue(id);
                if (!sessionDocumentInfo) {
                    return;
                }

                const documentInfo = this._getOrAddModifications(id, sessionDocumentInfo, true);
                const changeVector = BatchOperation._getStringField(batchResult, "PATCH", "ChangeVector");
                const lastModified = BatchOperation._getStringField(batchResult, "PATCH", "LastModified");
                documentInfo.ChangeVector = changeVector;
                documentInfo.metadata[CONSTANTS.Documents.Metadata.ID] = id;
                documentInfo.metadata[CONSTANTS.Documents.Metadata.CHANGE_VECTOR] = changeVector;
                documentInfo.metadata[CONSTANTS.Documents.Metadata.LAST_MODIFIED] = lastModified;
                documentInfo.document = document;
                this._applyMetadataModifications(id, documentInfo);
                if (documentInfo.entity) {
                    this._session.entityToJson.populateEntity(
                        documentInfo.entity, id, documentInfo.document);

                    const afterSaveChangesEventArgs =
                        new SessionAfterSaveChangesEventArgs(
                            this._session, documentInfo.Id, documentInfo.entity);

                    this._session.emit("afterSaveChanges", afterSaveChangesEventArgs);
                }

                break;
       }
    }

    private _handleDelete(batchResult: object) {
        this._handleDeleteInternal(batchResult, "DELETE");
    }

    private _handleDeleteInternal(batchResult: object, type: CommandType): void {
        const id = BatchOperation._getStringField(batchResult, type, "Id");
        const documentInfo = this._session.documentsById.getValue(id);
        if (!documentInfo) {
            return;
        }
        this._session.documentsById.remove(id);
        if (documentInfo.entity) {
            this._session.documentsByEntity.remove(documentInfo.entity);
            this._session.deletedEntities.remove(documentInfo.entity);
        }
    }

    private _handleForceRevisionCreation(batchResult: object) {
        // When forcing a revision for a document that does Not have any revisions yet then the HasRevisions flag is added to the document.
        // In this case we need to update the tracked entities in the session with the document new change-vector.

        if (!BatchOperation._getBooleanField(batchResult, "ForceRevisionCreation", "RevisionCreated")) {
            // no forced revision was created...nothing to update.
            return;
        }

        const id = BatchOperation._getStringField(batchResult, "ForceRevisionCreation", CONSTANTS.Documents.Metadata.ID);
        const changeVector = BatchOperation._getStringField(batchResult, "ForceRevisionCreation", CONSTANTS.Documents.Metadata.CHANGE_VECTOR);

        const documentInfo = this._session.documentsById.getValue(id);
        if (!documentInfo) {
            return;
        }

        documentInfo.ChangeVector = changeVector;
        this._handleMetadataModifications(documentInfo, batchResult, id, changeVector);

        const afterSaveChangesEventArgs = new SessionAfterSaveChangesEventArgs(this._session, documentInfo.Id, documentInfo.entity);
        this._session.emit("afterSaveChanges", afterSaveChangesEventArgs);
    }

    private _handlePut(index: number, batchResult: object, isDeferred: boolean): void {
        let entity = null;
        let documentInfo = null;
        if (!isDeferred) {
            entity = this._entities[index];
            documentInfo = this._session.documentsByEntity.get(entity);
            if (!documentInfo) {
                return;
            }
        }

        const id = BatchOperation._getStringField(batchResult, "PUT", CONSTANTS.Documents.Metadata.ID);
        const changeVector = BatchOperation._getStringField(
            batchResult, "PUT", CONSTANTS.Documents.Metadata.CHANGE_VECTOR);

        if (isDeferred) {
            const sessionDocumentInfo = this._session.documentsById.getValue(id);
            if (!sessionDocumentInfo) {
                return;
            }
            
            documentInfo = this._getOrAddModifications(id, sessionDocumentInfo, true);
            entity = documentInfo.entity;
        }

        this._handleMetadataModifications(documentInfo, batchResult, id, changeVector);

        this._session.documentsById.add(documentInfo);

        if (entity) {
            this._session.generateEntityIdOnTheClient.trySetIdentity(entity, id);
        }

        const afterSaveChangesEventArgs = new SessionAfterSaveChangesEventArgs(
            this._session, documentInfo.id, documentInfo.entity);
        this._session.emit("afterSaveChanges", afterSaveChangesEventArgs);
    }

    private _handleMetadataModifications(documentInfo: DocumentInfo, batchResult: object, id: string, changeVector: string) {
        for (const propertyName of Object.keys(batchResult)) {
            if (propertyName === "type") {
                continue;
            }

            documentInfo.metadata[propertyName] = batchResult[propertyName];
        }

        documentInfo.Id = id;
        documentInfo.ChangeVector = changeVector;
        this._applyMetadataModifications(id, documentInfo);
    }

    private _handleCounters(batchResult: object): void {
        const docId = BatchOperation._getStringField(batchResult, "Counters", "Id");
        const countersDetail = batchResult["CountersDetail"];
        if (!countersDetail) {
            BatchOperation._throwMissingField("Counters", "CountersDetail");
        }

        const counters = countersDetail["Counters"] as object[];
        if (!counters) {
            BatchOperation._throwMissingField("Counters", "Counters");
        }

        let cache = this._session.countersByDocId.get(docId);
        if (!cache) {
            cache = { 
                gotAll: false, 
                data: CaseInsensitiveKeysMap.create<number>() 
            } as CounterTracking;
            this._session.countersByDocId.set(docId, cache);
        }

        const changeVector = BatchOperation._getStringField(batchResult, "Counters", "DocumentChangeVector", false);
        if (changeVector) {
            const documentInfo = this._session.documentsById.getValue(docId);
            if (documentInfo) {
                documentInfo.ChangeVector = changeVector;
            }
        }

        for (const counter of counters) {
            const name = counter["CounterName"];
            const value = counter["TotalValue"];
            if (name && value) {
                cache.data.set(name, value);
            }
        }
    }

    private static _getStringField(json: object, type: CommandType, fieldName: string, throwOnMissing: boolean  = true): string {
        if ((!(fieldName in json) || TypeUtil.isNullOrUndefined(json[fieldName])) && throwOnMissing) {
            BatchOperation._throwMissingField(type, fieldName);
        }

        const jsonNode = json[fieldName];
        if (jsonNode && !TypeUtil.isString(jsonNode)) {
            throwError("InvalidOperationException", `Expected response field ${fieldName} to be a string.`);
        }

        return jsonNode;
    }

    private static _getNumberField(json: object, type: CommandType, fieldName: string): number {
        if (!(fieldName in json)) {
            BatchOperation._throwMissingField(type, fieldName);
        }

        const jsonNode = json[fieldName];
        return jsonNode;
    }

    private static _getBooleanField(json: object, type: CommandType, fieldName: string): boolean {
        if (!(fieldName in json)) {
            BatchOperation._throwMissingField(type, fieldName);
        }

        const jsonNode = json[fieldName];
        return jsonNode;
    }

    private static _throwMissingField(type: CommandType, fieldName: string): void {
        throwError("InvalidOperationException", type + " response is invalid. Field '" + fieldName + "' is missing.");
    }

}

function getCommandType(batchResult: object): CommandType {
    return batchResult["Type"] || "None";
}       
