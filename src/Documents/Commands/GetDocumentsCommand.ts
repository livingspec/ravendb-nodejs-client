import * as stream from "readable-stream";
import { RavenCommand } from "../../Http/RavenCommand";
import {
    RavenCommandResponsePipeline
} from "../../Http/RavenCommandResponsePipeline";
import { ServerNode } from "../../Http/ServerNode";
import { HttpRequestParameters } from "../../Primitives/Http";
import { getHeaders } from "../../Utility/HttpUtil";
import { TypeUtil } from "../../Utility/TypeUtil";
import { throwError } from "../../Exceptions";
import { DocumentConventions } from "../Conventions/DocumentConventions";
import { COUNTERS } from "../../Constants";
import { HashCalculator } from "../Queries/HashCalculator";
import { IRavenObject } from "../../Types/IRavenObject";

export interface GetDocumentsCommandCounterOptions {
    counterIncludes?: string[];
    includeAllCounters?: boolean;
}

export interface GetDocumentsCommandOptionsBase extends GetDocumentsCommandCounterOptions {
    conventions: DocumentConventions;
}

export interface GetDocumentsByIdCommandOptions
    extends GetDocumentsCommandOptionsBase {
    Id: string;
    includes?: string[];
    metadataOnly?: boolean;
}

export interface GetDocumentsByIdsCommandOptions
    extends GetDocumentsCommandOptionsBase {
    Ids: string[];
    includes?: string[];
    metadataOnly?: boolean;
}

export interface GetDocumentsStartingWithOptions
    extends GetDocumentsCommandOptionsBase {
    start: number;
    pageSize: number;
    startsWith?: string;
    startsAfter?: string;
    matches?: string;
    exclude?: string;
    metadataOnly?: boolean;
}

export interface DocumentsResult {
    CounterIncludes: IRavenObject;
    Includes: IRavenObject;
    Results: any[];
}

export interface GetDocumentsResult extends DocumentsResult {
    NextPageStart: number;
}

export class GetDocumentsCommand extends RavenCommand<GetDocumentsResult> {

    private readonly _id: string;

    private readonly _ids: string[];
    private readonly _includes: string[];    
    
    private _counters: string[];
    private _includeAllCounters: boolean;

    private readonly _metadataOnly: boolean;

    private readonly _startsWith: string;
    private readonly _matches: string;
    private readonly _start: number;
    private readonly _pageSize: number;
    private readonly _exclude: string;
    private readonly _startAfter: string;

    private readonly _conventions: DocumentConventions;

    public constructor(
        opts: GetDocumentsByIdCommandOptions | GetDocumentsByIdsCommandOptions | GetDocumentsStartingWithOptions) {
        super();

        this._conventions = opts.conventions;

        if (opts.hasOwnProperty("Id")) {
            opts = opts as GetDocumentsByIdCommandOptions;
            if (!opts.Id) {
                throwError("InvalidArgumentException", "id cannot be null");
            }
            this._id = opts.Id;
            this._includes = opts.includes;
            this._metadataOnly = opts.metadataOnly;
        } else if (opts.hasOwnProperty("Ids")) {
            opts = opts as GetDocumentsByIdsCommandOptions;
            if (!opts.Ids || opts.Ids.length === 0) {
                throwError("InvalidArgumentException", "Please supply at least one id");
            }
            this._ids = opts.Ids;
            this._includes = opts.includes;
            this._metadataOnly = opts.metadataOnly;
        } else if (opts.hasOwnProperty("start") && opts.hasOwnProperty("pageSize")) {
            opts = opts as GetDocumentsStartingWithOptions;
            this._start = opts.start;
            this._pageSize = opts.pageSize;

            if (opts.hasOwnProperty("startsWith")) {
                if (!opts.startsWith) {
                    throwError("InvalidArgumentException", "startWith cannot be null");
                }
                this._startsWith = opts.startsWith;
                this._startAfter = opts.startsAfter;
                this._matches = opts.matches;
                this._exclude = opts.exclude;
                this._metadataOnly = opts.metadataOnly;
            }
        }

        if (opts.hasOwnProperty("includeAllCounters" as keyof GetDocumentsCommandCounterOptions)) {
            this._includeAllCounters = opts.includeAllCounters;
        }

        if (opts.hasOwnProperty("counterIncludes" as keyof GetDocumentsCommandCounterOptions)) {
            const counters = opts.counterIncludes as string[];
            if (!counters) {
                throwError("InvalidArgumentException", "CounterIncludes cannot be null.");
            }

            this._counters = counters;
        }
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        const uriPath = `${node.Url}/databases/${node.Database}/docs?`;

        let query = "";
        if (!TypeUtil.isNullOrUndefined(this._start)) {
            query += `&start=${this._start}`;
        }

        if (this._pageSize) {
            query += `&pageSize=${this._pageSize}`;
        }

        if (this._metadataOnly) {
            query += "&metadataOnly=true";
        }

        if (this._startsWith) {
            query += `&startsWith=${encodeURIComponent(this._startsWith)}`;

            if (this._matches) {
                query += `&matches=${encodeURIComponent(this._matches)}`;
            }

            if (this._exclude) {
                query += `&exclude=${encodeURIComponent(this._exclude)}`;
            }

            if (this._startAfter) {
                query += `&startAfter=${this._startAfter}`;
            }
        }

        if (this._includes) {
            for (const include of this._includes) {
                query += `&include=${encodeURIComponent(include)}`;
            }
        }

        if (this._includeAllCounters) {
            query += `&counter=${COUNTERS.ALL}`;
        } else if (this._counters && this._counters.length) {
            for (const counter of this._counters) {
                query += `&counter=${encodeURIComponent(counter)}`;
            }
        }

        let request: HttpRequestParameters = { method: "GET", uri: uriPath + query };

        if (this._id) {
            request.uri += `&id=${encodeURIComponent(this._id)}`;
        } else if (this._ids) {
            request = this.prepareRequestWithMultipleIds(request, this._ids);
        }

        return request;
    }

    public prepareRequestWithMultipleIds(request: HttpRequestParameters, ids: string[]): HttpRequestParameters {
        const uniqueIds = new Set<string>(ids);

        // if it is too big, we fallback to POST (note that means that we can't use the HTTP cache any longer)
        // we are fine with that, requests to load > 1024 items are going to be rare
        const isGet: boolean = Array.from(uniqueIds)
            .map(x => x.length)
            .reduce((result, next) => result + next, 0) < 1024;

        let newUri = request.uri;
        if (isGet) {
            uniqueIds.forEach(x => {
                newUri += `&id=${encodeURIComponent(x || "")}`;
            });

            return { method: "GET", uri: newUri };
        } else {
            const body = this._serializer
                .serialize({ ids: [...uniqueIds] });

            const calculateHash = GetDocumentsCommand._calculateHash(uniqueIds);
            newUri += `&loadHash=${encodeURIComponent(calculateHash)}`;

            return {
                uri: newUri,
                method: "POST",
                headers: getHeaders()
                    .typeAppJson()
                    .build(),
                body
            };
        }
    }

    private static _calculateHash(uniqueIds: Set<string>): string {
        const hasher = new HashCalculator();

        for (const x of uniqueIds) {
            hasher.write(x);
        }

        return hasher.getHash();
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this.result = null;
            return;
        }

        let body: string = null;
        this.result =
            await GetDocumentsCommand.parseDocumentsResultResponseAsync(
                bodyStream, this._conventions, b => body = b);

        return body as string;
    }

    public static async parseDocumentsResultResponseAsync(
        bodyStream: stream.Stream,
        conventions: DocumentConventions,
        bodyCallback?: (body: string) => void): Promise<GetDocumentsResult> {

        return RavenCommandResponsePipeline.create<GetDocumentsResult>()
            .collectBody(bodyCallback)
            .parseJsonSync()
            .process(bodyStream);
    }

    public get isReadRequest(): boolean {
        return true;
    }
}
