import { InMemoryDocumentSessionOperations } from "../InMemoryDocumentSessionOperations";
import { getLogger } from "../../../Utility/LogUtil";
import { DocumentInfo } from "../DocumentInfo";
import { 
    GetDocumentsCommand, 
    GetDocumentsResult, 
    GetDocumentsByIdsCommandOptions 
} from "../../Commands/GetDocumentsCommand";
import { TypeUtil } from "../../../Utility/TypeUtil";
import { throwError } from "../../../Exceptions";
import { ObjectTypeDescriptor, EntitiesCollectionObject, ObjectTypeMap } from "../../../Types";
import { StringUtil } from "../../../Utility/StringUtil";


const log = getLogger({ module: "LoadOperation" });

export class LoadOperation {

    private _session: InMemoryDocumentSessionOperations;

    private _ids: string[];
    private _includes: string[];
    private _countersToInclude: string[];
    private _includeAllCounters: boolean;

    private _resultsSet: boolean;
    private _results: GetDocumentsResult;

    public constructor(session: InMemoryDocumentSessionOperations) {
        this._session = session;
    }

    public createRequest(): GetDocumentsCommand {
        if (this._session.checkIfIdAlreadyIncluded(this._ids, this._includes)) {
            return null;
        }

        this._session.incrementRequestCount();

        log.info("Requesting the following ids "
            + this._ids.join(",") + " from " + this._session.storeIdentifier);

        const opts: GetDocumentsByIdsCommandOptions = {
                Ids: this._ids,
                includes: this._includes,
                metadataOnly: false,
                conventions: this._session.conventions
        };

        if (this._includeAllCounters) {
            opts.includeAllCounters = true;
        } else if (this._countersToInclude) {
            opts.counterIncludes = this._countersToInclude; 
        }

        return new GetDocumentsCommand(opts);
    }

    public byId(id: string): LoadOperation {
        if (StringUtil.isNullOrEmpty(id)) {
            return this;
        }

        if (!this._ids) {
            this._ids = [id];
        }

        return this;
    }

    public withCounters(counters: string[]): LoadOperation {
        if (counters) {
            this._countersToInclude = counters;
        }

        return this;
    }
     public withAllCounters() {
        this._includeAllCounters = true;
        return this;
    }

    public withIncludes(includes: string[]): LoadOperation {
        this._includes = includes || [];
        return this;
    }

    public byIds(ids: string[]): LoadOperation {
        const distinct = new Set(ids.filter(x => !StringUtil.isNullOrEmpty(x)));

        this._ids = Array.from(distinct);

        return this;
    }

    public getDocument<T extends object>(clazz: ObjectTypeDescriptor<T>, objectTypeOverrides?: ObjectTypeMap): T {
        if (this._session.noTracking) {
            if (!this._resultsSet && this._ids.length) {
                throwError("InvalidOperationException", "Cannot execute getDocument before operation execution.");
            }

            if (!this._results || !this._results.Results || !this._results.Results.length) {
                return null;
            }

            const document = this._results.Results[0];
            if (!document) {
                return null;
            }

            const documentInfo = DocumentInfo.getNewDocumentInfo(document);
            return this._session.trackEntity(clazz, documentInfo, objectTypeOverrides);
        }

        return this._getDocument(clazz, this._ids[0]);
    }

    private _getDocument<T extends object>(clazz: ObjectTypeDescriptor<T>, id: string, objectTypeOverrides?: ObjectTypeMap): T {
        if (!id) {
            return null;
        }

        if (this._session.isDeleted(id)) {
            return null;
        }

        let doc = this._session.documentsById.getValue(id);
        if (doc) {
            return this._session.trackEntity(clazz, doc, objectTypeOverrides);
        }

        doc = this._session.includedDocumentsById.get(id);
        if (doc) {
            return this._session.trackEntity(clazz, doc, objectTypeOverrides);
        }

        return null;
    }

    public getDocuments<T extends object>(clazz: ObjectTypeDescriptor<T>, objectTypeOverrides?: ObjectTypeMap): EntitiesCollectionObject<T> {
        if (this._session.noTracking) {
            if (!this._resultsSet && this._ids.length) {
                throwError(
                    "InvalidOperationException", "Cannot execute 'getDocuments' before operation execution.");
            }

            const finalResults = this._ids.filter(x => !!x)
                .reduce((result, next) => {
                    result[next] = null;
                    return result;
                }, {});

            if (!this._results || !this._results.Results || !this._results.Results.length) {
                return finalResults;
            }
            
            for (const document of this._results.Results) {
                if (!document) {
                    continue;
                }

                const newDocumentInfo = DocumentInfo.getNewDocumentInfo(document);
                finalResults[newDocumentInfo.Id] = this._session.trackEntity(clazz, newDocumentInfo, objectTypeOverrides);
            }
            
            return finalResults;
        }

        return this._ids.filter(x => !!x)
            .reduce((result, id) => {
                result[id] = this._getDocument(clazz, id, objectTypeOverrides);
                return result;
            }, {});
    }

    public setResult(result: GetDocumentsResult): void {
        this._resultsSet = true;

        if (this._session.noTracking) {
            this._results = result;
            return;
        }

        if (!result) {
            this._session.registerMissing(this._ids);
            return;
        }

        this._session.registerIncludes(result.Includes);

        if (this._includeAllCounters || this._countersToInclude) {
            this._session.registerCounters(
                result.CounterIncludes, this._ids, this._countersToInclude, this._includeAllCounters);
        }

        for (const document of result.Results) {
            if (!document || TypeUtil.isNullOrUndefined(document)) {
                continue;
            }

            const newDocumentInfo = DocumentInfo.getNewDocumentInfo(document);
            this._session.documentsById.add(newDocumentInfo);
        }

        for (const id of this._ids) {
            const value = this._session.documentsById.getValue(id);
            if (!value) {
                this._session.registerMissing(id);
            }
        }

        this._session.registerMissingIncludes(result.Results, result.Includes, this._includes);
    }
}
