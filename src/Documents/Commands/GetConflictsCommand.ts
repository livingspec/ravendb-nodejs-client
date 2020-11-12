import { HttpRequestParameters } from "../../Primitives/Http";
import { RavenCommand } from "../../Http/RavenCommand";
import { GetConflictsResult } from "./GetConflictsResult";
import { ServerNode } from "../../Http/ServerNode";
import * as stream from "readable-stream";
import { DocumentConventions } from "../Conventions/DocumentConventions";

export class GetConflictsCommand extends RavenCommand<GetConflictsResult> {

    private readonly _id: string;
    private readonly _conventions: DocumentConventions;

    public constructor(id: string, conventions: DocumentConventions) {
        super();
        this._id = id;
        this._conventions = conventions;
    }

    public get isReadRequest(): boolean {
        return true;
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        const uri = node.Url + "/databases/" + node.Database
            + "/replication/conflicts?docId=" + encodeURIComponent(this._id);
        return {
            method: "GET",
            uri
        };
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        let body: string = null;
        await this._defaultPipeline(_ => body = _).process(bodyStream)
            .then(results => {
                this.result = this._conventions.objectMapper.fromObjectLiteral(results, {
                    nestedTypes: {
                        "Results[].LastModified": "date"
                    }
                });
            });

        return body;
    }
}
