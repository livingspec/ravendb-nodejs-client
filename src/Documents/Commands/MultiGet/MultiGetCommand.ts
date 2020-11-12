import * as stream from "readable-stream";
import { RavenCommand } from "../../../Http/RavenCommand";
import { GetResponse } from "./GetResponse";
import { HttpCache } from "../../../Http/HttpCache";
import { HttpRequestParameters } from "../../../Primitives/Http";
import { GetRequest } from "./GetRequest";
import { ServerNode } from "../../../Http/ServerNode";
import { StatusCodes } from "../../../Http/StatusCode";
import { getEtagHeader } from "../../../Utility/HttpUtil";
import { DocumentConventions } from "../../Conventions/DocumentConventions";

export class MultiGetCommand extends RavenCommand<GetResponse[]> {
    private _cache: HttpCache;
    private readonly _commands: GetRequest[];
    private _conventions: DocumentConventions;
    private _baseUrl: string;

    public constructor(cache: HttpCache, conventions: DocumentConventions, commands: GetRequest[]) {
        super();
        this._cache = cache;
        this._commands = commands;
        this._conventions = conventions;
        this._responseType = "Raw";
    }

    private _getCacheKey(command: GetRequest): string {
        const url = this._baseUrl + command.urlAndQuery;
        return (command.method || "GET") + "-" + url;
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        this._baseUrl = node.Url + "/databases/" + node.Database;

        const requests = [];
        const bodyObj = { Requests: requests };
        const request: HttpRequestParameters = {
            uri: this._baseUrl + "/multi_get",
            method: "POST",
            headers: this._headers().typeAppJson().build(),
        };

        for (const command of this._commands) {
            const cacheKey = this._getCacheKey(command);
            let cacheItemInfo = null;
            this._cache.get(cacheKey, (itemInfo) => cacheItemInfo = itemInfo);
            const headers = {};
            if (cacheItemInfo.cachedChangeVector) {
                headers["If-None-Match"] = `"${cacheItemInfo.cachedChangeVector}"`;
            }

            Object.assign(headers, command.headers);
            const req = {
                Url: "/databases/" + node.Database + command.url,
                Query: command.query,
                Method: command.method || "GET",
                Headers: headers,
                Content: command.body
            };

            requests.push(req);
        }

        request.body = JSON.stringify(bodyObj);

        return request;
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        const result = await this._pipeline<GetResponse[]>()
            .parseJsonSync()
            .process(bodyStream);
        
        const responses = result["Results"].reduce((result: GetResponse[], next) => {
            // TODO try to get it directly from parser
            next.Result = JSON.stringify(next.Result);
            return [...result, next];
        }, []);

        for (let i = 0; i < responses.length; i++) {
            const res = responses[i];
            const command = this._commands[i];
            this._maybeSetCache(res, command);
            this._maybeReadFromCache(res, command);
        }

        this.result = responses.map(x => GetResponse.create(x));
        return null;
    }

    private _maybeReadFromCache(getResponse: GetResponse, command: GetRequest): void {
        if (getResponse.StatusCode !== StatusCodes.NotModified) {
            return;
        }

        const cacheKey = this._getCacheKey(command);
        let cachedResponse = null;
        this._cache.get(cacheKey, x => cachedResponse = x.response);
        getResponse.Result = cachedResponse;
    }

    private _maybeSetCache(getResponse: GetResponse, command: GetRequest): void {
        if (getResponse.StatusCode === StatusCodes.NotModified) {
            return;
        }

        const cacheKey = this._getCacheKey(command);
        const result = getResponse.Result;
        if (!result) {
            return;
        }

        const changeVector = getEtagHeader(getResponse.Headers);
        if (!changeVector) {
            return;
        }

        this._cache.set(cacheKey, changeVector, result);
    }

    public get isReadRequest(): boolean {
        return false;
    }
}
