import { InMemoryDocumentSessionOperations } from "./InMemoryDocumentSessionOperations";
import { DocumentInfo } from "./DocumentInfo";
import { TypeUtil } from "../../Utility/TypeUtil";
import { DocumentConventions } from "../Conventions/DocumentConventions";
import { CONSTANTS } from "../../Constants";
import { DocumentType } from "../DocumentAbstractions";
import { TypeInfo } from "../../Mapping/ObjectMapper";
import { throwError } from "../../Exceptions";
import { SetupDocumentBase } from "../SetupDocumentBase";
import { MetadataObject } from "./MetadataObject";
import { ObjectTypeDescriptor } from "../../Types";
import { Reference } from "../../Utility/Reference";

export class EntityToJson {

    private readonly _session: InMemoryDocumentSessionOperations;

    /**
     * All the listeners for this session
     */
    public constructor(session: InMemoryDocumentSessionOperations) {
        this._session = session;
    }

    private _missingDictionary: Map<object, Map<string, object>> = new Map();

    public get missingDictionary() {
        return this._missingDictionary;
    }

    public convertEntityToJson(entity: object, documentInfo: DocumentInfo): object {
        const { conventions } = this._session;
        const entityMapper = conventions.objectMapper;

        if (documentInfo) {
            this._session.onBeforeConversionToDocumentInvoke(documentInfo.Id, entity);
        }

        let document = EntityToJson._convertEntityToJsonInternal(entity, this._session.conventions, documentInfo);

        if (documentInfo) {
            const documentReference: Reference<object> = {
                value: document
            };
            this._session.onAfterConversionToDocumentInvoke(documentInfo.Id, entity, documentReference);
            document = documentReference.value;
        }

        return document;
    }

    //TODO: internal static object ConvertToBlittableForCompareExchangeIfNeeded(

    private static _convertEntityToJsonInternal(entity: object, conventions: DocumentConventions, documentInfo: DocumentInfo, removeIdentityProperty = true) {
        const entityMapper = conventions.objectMapper;
        let typeInfo: TypeInfo;
        let jsonNode = entityMapper.toObjectLiteral(entity, (_typeInfo) => {
            typeInfo = _typeInfo;
        }, conventions.knownEntityTypesByName);

        if (entity instanceof SetupDocumentBase) {
            jsonNode = entity.toRemoteFieldNames();
        } else {
            jsonNode = conventions.transformObjectKeysToRemoteFieldNameConvention(jsonNode);
        }

        EntityToJson._writeMetadata(jsonNode, typeInfo, documentInfo);

        const type: DocumentType = TypeUtil.findType(entity, conventions.knownEntityTypes);
        if (removeIdentityProperty) {
            EntityToJson._tryRemoveIdentityProperty(jsonNode, type, conventions);
        }

        return jsonNode;
    }

    //TODO: private void RegisterMissingProperties(object o, string id, object value)

    public static convertEntityToJson(
        entity: object, conventions: DocumentConventions): object;
    public static convertEntityToJson(
        entity: object, 
        conventions: DocumentConventions, 
        documentInfo: DocumentInfo,
        removeIdentityProperty: boolean): object;
    public static convertEntityToJson(
        entity: object, 
        conventions: DocumentConventions, 
        documentInfo?: DocumentInfo, 
        removeIdentityProperty: boolean = true): object {

        let typeInfo: TypeInfo;
        const jsonNode = conventions.objectMapper.toObjectLiteral(entity, (_typeInfo) => {
            typeInfo = _typeInfo;
        });

        EntityToJson._writeMetadata(jsonNode, typeInfo, documentInfo);

        if (removeIdentityProperty) {
            EntityToJson._tryRemoveIdentityProperty(jsonNode, typeInfo.typeName, conventions);
        }

        return jsonNode;
    }

    private static _writeMetadata(jsonNode: object, typeInfo: TypeInfo, documentInfo: DocumentInfo): void {
        if (!documentInfo) {
            return;
        }

        if (documentInfo.metadata) {
            documentInfo.metadata[CONSTANTS.Documents.Metadata.NESTED_OBJECT_TYPES] = typeInfo.nestedTypes;
            documentInfo.metadata[CONSTANTS.Documents.Metadata.RAVEN_JS_TYPE] =
                documentInfo.metadata[CONSTANTS.Documents.Metadata.RAVEN_JS_TYPE] || typeInfo.typeName;
        }

        if (documentInfo.metadataInstance) {
            documentInfo.metadataInstance[CONSTANTS.Documents.Metadata.NESTED_OBJECT_TYPES] = typeInfo.nestedTypes;
            documentInfo.metadataInstance[CONSTANTS.Documents.Metadata.RAVEN_JS_TYPE] =
               documentInfo.metadataInstance["Raven-Node-Type"] || typeInfo.typeName;
        }

        let setMetadata: boolean = false;
        const metadataNode: MetadataObject = {};

        if (documentInfo.metadata && Object.keys(documentInfo.metadata).length > 0) {
            setMetadata = true;
            Object.assign(metadataNode, documentInfo.metadata);

            // Add the document @metadata fields (for RDBC-213)
            const entityMeta = documentInfo.entity[CONSTANTS.Documents.Metadata.KEY];
            for (const metadataItem in entityMeta) {
                if (entityMeta.hasOwnProperty(metadataItem)) {
                    setMetadata = true;
                    metadataNode[metadataItem] = entityMeta[metadataItem];
                }
            }
        } else if (documentInfo.metadataInstance) {
            setMetadata = true;
            Object.assign(metadataNode, documentInfo.metadataInstance);
        }

        if (documentInfo.collection) {
            setMetadata = true;
            metadataNode["@collection"] = documentInfo.collection;
        }

        if (setMetadata) {
            jsonNode[CONSTANTS.Documents.Metadata.KEY] = metadataNode;
        }
    }

    /**
     * Converts a json object to an entity.
     */
    public convertToEntity(targetEntityType: DocumentType, id: string, document: object): object;
    public convertToEntity(targetEntityType: DocumentType, id: string, document: object, trackEntity: boolean): object;
    public convertToEntity(targetEntityType: DocumentType, id: string, document: object, trackEntity: boolean = true): object {
        const conventions = this._session.conventions;

        const entityType: ObjectTypeDescriptor = conventions.getJsTypeByDocumentType(targetEntityType);
        try {
            if (TypeUtil.isType(document, targetEntityType)) {
                return document;
            }

            const documentRef: Reference<object> = {
                value: document
            };
            this._session.onBeforeConversionToEntityInvoke(id, entityType, documentRef);
            document = documentRef.value;

            let entity;

            //TODO: if track! -> RegisterMissingProperties

            const documentTypeFromConventions = conventions.getJsType(id, document);

            const entityTypeInfoFromMetadata = EntityToJson._getEntityTypeInfoFromMetadata(document);
            if (documentTypeFromConventions) {
                const passedEntityTypeIsAssignableFromConventionsDocType =
                    entityType
                    && ((entityType.name === documentTypeFromConventions.name)
                    || TypeUtil.isInstanceOf(entityType, documentTypeFromConventions));
                if (passedEntityTypeIsAssignableFromConventionsDocType) {
                    const mapper = conventions.objectMapper;
                    entity = mapper.fromObjectLiteral(
                        document, entityTypeInfoFromMetadata, trackEntity);
                }
            }

            if (!entity) {
                const mapper = conventions.objectMapper;
                let passedTypeInfo = entityTypeInfoFromMetadata;
                if (entityType) {
                    passedTypeInfo =
                        Object.assign(passedTypeInfo, { typeName: entityType.name });
                }

                entity = mapper.fromObjectLiteral(
                    document, passedTypeInfo, trackEntity);
            }

            const isProjection = !!document[CONSTANTS.Documents.Metadata.PROJECTION];

            if (id) {
                this._session.generateEntityIdOnTheClient.trySetIdentity(entity, id, isProjection);
            }

            this._session.onAfterConversionToEntityInvoke(id, document, entity);

            return entity;
        } catch (err) {
            throwError("InvalidOperationException",
                `Could not convert document ${id} to entity of type `
                + `${entityType ? entityType.name : entityType}: ${err.stack}`,
                err);
        }
    }

    private static _getEntityTypeInfoFromMetadata(document: object): TypeInfo {
        const metadata = document[CONSTANTS.Documents.Metadata.KEY];
        if (!metadata) {
            return {};
        }

        return {
            typeName: metadata[CONSTANTS.Documents.Metadata.RAVEN_JS_TYPE],
            nestedTypes: metadata[CONSTANTS.Documents.Metadata.NESTED_OBJECT_TYPES]
        };
    }

    public populateEntity(entity: object, id: string, document: object): void {
        if (!entity) {
            throwError("InvalidArgumentException", "Entity cannot be null.");
        }
        
        if (!id) {
            throwError("InvalidArgumentException", "Id cannot be null.");
        }
        
        if (!document) {
            throwError("InvalidArgumentException", "Document cannot be null.");
        }

        try {
            const entityValue = this._session.conventions.objectMapper.fromObjectLiteral(document);
            Object.assign(entity, entityValue);
            this._session.generateEntityIdOnTheClient.trySetIdentity(entity, id);
        } catch (e) {
            throwError("InvalidOperationException", "Could not populate entity.", e);
        }
    }

    private static _tryRemoveIdentityProperty(
        document: object, entityType: DocumentType, conventions: DocumentConventions): boolean {
        const identityProperty = conventions.getIdentityProperty(entityType);

        if (!identityProperty) {
            return false;
        }

        delete document[identityProperty];
        return true;
    }

    public removeFromMissing(entity: object) {
        this._missingDictionary.delete(entity);
    }

    public clear(): void {
        this._missingDictionary.clear();
    }
}
