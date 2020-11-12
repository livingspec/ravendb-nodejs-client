import { InMemoryDocumentSessionOperations } from "../InMemoryDocumentSessionOperations";
import { IndexQuery } from "../../Queries/IndexQuery";
import { QueryResult } from "../../Queries/QueryResult";
import { FieldsToFetchToken } from "../Tokens/FieldsToFetchToken";
import { Stopwatch } from "../../../Utility/Stopwatch";
import { getLogger } from "../../../Utility/LogUtil";
import { QueryCommand } from "../../Commands/QueryCommand";
import { throwError } from "../../../Exceptions";
import * as StringBuilder from "string-builder";
import {
    DocumentType,
} from "../../DocumentAbstractions";
import { CONSTANTS } from "../../../Constants";
import { TypeUtil } from "../../../Utility/TypeUtil";
import { StringUtil } from "../../../Utility/StringUtil";
import { Reference } from "../../../Utility/Reference";
import { NESTED_OBJECT_TYPES_PROJECTION_FIELD } from "../DocumentQuery";

const log = getLogger({ module: "QueryOperation" });

export class QueryOperation {
    private readonly _session: InMemoryDocumentSessionOperations;
    private readonly _indexName: string;
    private readonly _indexQuery: IndexQuery;
    private readonly _metadataOnly: boolean;
    private readonly _indexEntriesOnly: boolean;
    private readonly _isProjectInto: boolean;
    private _currentQueryResults: QueryResult;
    private readonly _fieldsToFetch: FieldsToFetchToken;
    private _sp: Stopwatch;
    private _noTracking: boolean;

    public constructor(
        session: InMemoryDocumentSessionOperations,
        indexName: string,
        indexQuery: IndexQuery,
        fieldsToFetch: FieldsToFetchToken,
        disableEntitiesTracking: boolean,
        metadataOnly: boolean,
        indexEntriesOnly: boolean,
        isProjectInto: boolean) {
        this._session = session;
        this._indexName = indexName;
        this._indexQuery = indexQuery;
        this._fieldsToFetch = fieldsToFetch;
        this._noTracking = disableEntitiesTracking;
        this._metadataOnly = metadataOnly;
        this._indexEntriesOnly = indexEntriesOnly;
        this._isProjectInto = isProjectInto;

        this._assertPageSizeSet();
    }

    public createRequest(): QueryCommand {
        this._session.incrementRequestCount();

        this.logQuery();

        return new QueryCommand(this._session.conventions, this._indexQuery, {
            metadataOnly: this._metadataOnly,
            indexEntriesOnly: this._indexEntriesOnly,
            noTracking: this._noTracking
        });
    }

    public getCurrentQueryResults(): QueryResult {
        return this._currentQueryResults;
    }

    public setResult(queryResult: QueryResult): void {
        this.ensureIsAcceptableAndSaveResult(queryResult, null);
    }

    private _assertPageSizeSet(): void {
        if (!this._session.conventions.isThrowIfQueryPageSizeIsNotSet()) {
            return;
        }

        if (this._indexQuery.pageSizeSet) {
            return;
        }

        throwError("InvalidOperationException",
            "Attempt to query without explicitly specifying a page size. " +
            "You can use .take() methods to set maximum number of results. " +
            "By default the page size is set to Integer.MAX_VALUE and can cause severe performance degradation.");
    }

    private _startTiming(): void {
        this._sp = Stopwatch.createStarted();
    }

    public logQuery(): void {
        log.info(
            "Executing query '" + this._indexQuery.query + "'"
            + (this._indexName ? "' on index '" + this._indexName + "'" : "")
            + " in " + this._session.storeIdentifier);
    }

    /* TDB 4.1
    public enterQueryContext(): IDisposable {
        this._startTiming();

        if (!this._indexQuery.waitForNonStaleResults) {
            return null;
        }

        return this._session.documentStore.disableAggressiveCaching(this._session.databaseName);
    }
    */

    public complete<T extends object>(documentType?: DocumentType<T>): T[] {
        const queryResult = this._currentQueryResults.createSnapshot();

        const result = [] as T[];

        this._completeInternal(documentType, queryResult, x => result.push(x));

        return result;
    }

    private _completeInternal<T extends object>(documentType: DocumentType<T>, queryResult: QueryResult, addToResult: (item: T) => void): void {
        if (!this._noTracking) {
            this._session.registerIncludes(queryResult.Includes);
        }

        try {
            for (const document of queryResult.Results) {
                if (document[`${CONSTANTS.Documents.Metadata.KEY}.${CONSTANTS.Documents.Metadata.NESTED_OBJECT_TYPES}`]) {
                    document[CONSTANTS.Documents.Metadata.KEY][CONSTANTS.Documents.Metadata.NESTED_OBJECT_TYPES]
                        = document[`${CONSTANTS.Documents.Metadata.KEY}.${CONSTANTS.Documents.Metadata.NESTED_OBJECT_TYPES}`];
                }
                const metadata = document[CONSTANTS.Documents.Metadata.KEY];
                const idNode = metadata[CONSTANTS.Documents.Metadata.ID];

                let id = null;
                if (idNode && TypeUtil.isString(idNode)) {
                    id = idNode;
                }

                addToResult(
                    QueryOperation.deserialize(
                        id,
                        document,
                        metadata,
                        this._fieldsToFetch,
                        this._noTracking,
                        this._session,
                        documentType,
                        this._isProjectInto));
            }
        } catch (err) {
            log.warn(err, "Unable to read query result JSON.");
            throwError("RavenException", "Unable to read json.", err);
        }

        if (!this._noTracking) {
            this._session.registerMissingIncludes(
                queryResult.Results, queryResult.Includes, queryResult.IncludedPaths);
            
            if (queryResult.CounterIncludes) {
                this._session.registerCounters(queryResult.CounterIncludes, queryResult.IncludedCounterNames);
            }
        }
    }

    public static deserialize<T extends object>(
        id: string,
        document: object,
        metadata: object,
        fieldsToFetch: FieldsToFetchToken,
        disableEntitiesTracking: boolean,
        session: InMemoryDocumentSessionOperations,
        clazz?: DocumentType<T>,
        isProjectInto?: boolean
    ) {
        const { conventions } = session;
        const { entityFieldNameConvention } = conventions;
        const projection = metadata["@projection"];
        if (TypeUtil.isNullOrUndefined(projection) || projection === false) {
            const entityType = conventions.getJsTypeByDocumentType(clazz);
            return session.trackEntity(entityType, id, document, metadata, disableEntitiesTracking);
        }

        // return primitives only if type was not passed at all AND fields count is 1
        // if type was passed then use that even if it's only 1 field
        if (fieldsToFetch
            && fieldsToFetch.projections
            && (fieldsToFetch.projections.length === 1 || (fieldsToFetch.projections.includes(NESTED_OBJECT_TYPES_PROJECTION_FIELD) && fieldsToFetch.projections.length === 2))
            && !clazz) {
            // we only select a single field
            let projectionField = fieldsToFetch.projections.find(x => x !== NESTED_OBJECT_TYPES_PROJECTION_FIELD);

            if (fieldsToFetch.sourceAlias) {
                if (projectionField.startsWith(fieldsToFetch.sourceAlias)) {
                    // remove source-alias from projection name
                    projectionField = projectionField.substring(fieldsToFetch.sourceAlias.length + 1);
                }
                
                if (projectionField.startsWith("'")) {
                    projectionField = projectionField.substring(1, projectionField.length - 1);
                }
            }
            if (entityFieldNameConvention) {
                projectionField = StringUtil.changeCase(entityFieldNameConvention, projectionField);
            }

            const jsonNode = document[projectionField];
            if (TypeUtil.isNullOrUndefined(jsonNode)) {
                return null;
            }

            if (TypeUtil.isPrimitive(jsonNode)) {
                return jsonNode || null;
            }
            if (!isProjectInto) {
                if (fieldsToFetch.fieldsToFetch[0] === fieldsToFetch.projections[0]) {
                    if (TypeUtil.isObject(jsonNode)) { // extraction from original type
                        document = jsonNode;
                    }
                }
            }
        }


        const projType = conventions.getJsTypeByDocumentType(clazz);

        const documentRef: Reference<object> = {
            value: document
        };
        session.onBeforeConversionToEntityInvoke(id, clazz, documentRef);
        document = documentRef.value;

        const raw: T = conventions.objectMapper.fromObjectLiteral(document, null, !disableEntitiesTracking);

        // tslint:disable-next-line:new-parens
        const result = projType ? new (Function.prototype.bind.apply(projType)) : {};

        if (fieldsToFetch && fieldsToFetch.projections) {
            const keys = conventions.entityFieldNameConvention
                ? fieldsToFetch.projections.map(x => StringUtil.changeCase(conventions.entityFieldNameConvention, x))
                : fieldsToFetch.projections;

            const nestedTypes = raw[NESTED_OBJECT_TYPES_PROJECTION_FIELD];
            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];

                const mapper = conventions.objectMapper;
                const mapped = mapper.fromObjectLiteral(raw, {
                    typeName: "object",
                    nestedTypes
                }, !disableEntitiesTracking)

                result[key] = mapped[key];
            }
        } else {
            Object.assign(result, !entityFieldNameConvention
                ? raw : conventions.transformObjectKeysToLocalFieldNameConvention(raw));
        }

        session.onAfterConversionToEntityInvoke(id, document, result);

        return result;
    }

    public get noTracking() {
        return this._noTracking;
    }

    public set noTracking(value) {
        this._noTracking = value;
    }

    public isDisableEntitiesTracking(): boolean {
        return this._noTracking;
    }

    public setDisableEntitiesTracking(disableEntitiesTracking: boolean): void {
        this._noTracking = disableEntitiesTracking;
    }

    public ensureIsAcceptableAndSaveResult(result: QueryResult, duration: number): void {
        if (TypeUtil.isNullOrUndefined(duration)) {
            if (this._sp) {
                duration = this._sp.elapsed;
            } else {
                duration = null;
            }
        }

        if (!result) {
            throwError("IndexDoesNotExistException", `Could not find index ${this._indexName}.`);
        }

        QueryOperation.ensureIsAcceptable(result, this._indexQuery.waitForNonStaleResults, duration, this._session);

        this._saveQueryResult(result);
    }

    private _saveQueryResult(result: QueryResult) {
        this._currentQueryResults = result;

        // logging
        const isStale = result.IsStale ? " stale " : " ";

        const parameters = new StringBuilder();
        if (this._indexQuery.queryParameters
            && this._indexQuery.queryParameters.length) {
            parameters.append("(parameters: ");

            let first = true;

            const queryParameters = this._indexQuery.queryParameters;
            for (const parameterKey of Object.keys(queryParameters)) {
                const parameterValue = queryParameters[parameterKey];
                if (!first) {
                    parameters.append(", ");
                }

                parameters.append(parameterKey)
                    .append(" = ")
                    .append(parameterValue);

                first = false;
            }

            parameters.append(") ");
        }

        log.info("Query '"
            + this._indexQuery.query + "' "
            + parameters.toString()
            + "returned "
            + result.Results.length + isStale + "results (total index results: " + result.TotalResults + ")");
        // end logging
    }

    public static ensureIsAcceptable(
        result: QueryResult,
        waitForNonStaleResults: boolean,
        duration: Stopwatch | number,
        session: InMemoryDocumentSessionOperations): void {
        if (duration instanceof Stopwatch) {
            duration.stop();
            return QueryOperation.ensureIsAcceptable(result, waitForNonStaleResults, duration.elapsed, session);
        }

        if (waitForNonStaleResults && result.IsStale) {
            const msg = "Waited for " + duration.toString() + " for the query to return non stale result.";
            throwError("TimeoutException", msg);
        }
    }

    public get indexQuery(): IndexQuery {
        return this._indexQuery;
    }
}
