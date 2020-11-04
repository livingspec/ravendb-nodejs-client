import { RavenCommand } from "../../Http/RavenCommand";
import { ServerNode } from "../../Http/ServerNode";
import { HttpRequestParameters } from "../../Primitives/Http";
import * as stream from "readable-stream";

export class GetNextOperationIdCommand extends RavenCommand<number> {

    public get isReadRequest(): boolean {
        return false; // disable caching
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        const uri = `${node.Url}/databases/${node.Database}/operations/next-operation-id`;
        return { uri };
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        let body: string = null;
        await this._defaultPipeline(_ => body = _).process(bodyStream)
            .then(results => {
                const id = results["Id"];
                if (typeof id !== "undefined") {
                    this.result = id;
                }
            });
        return body;
    }
}
