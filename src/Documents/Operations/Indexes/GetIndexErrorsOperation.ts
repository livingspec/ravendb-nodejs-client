import { IMaintenanceOperation, OperationResultType } from "../OperationAbstractions";
import { IndexErrors } from "../../Indexes/Errors";
import { RavenCommand } from "../../../Http/RavenCommand";
import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { ServerNode } from "../../../Http/ServerNode";
import { HttpRequestParameters } from "../../../Primitives/Http";
import * as stream from "readable-stream";

export class GetIndexErrorsOperation implements IMaintenanceOperation<IndexErrors[]> {

    private readonly _indexNames: string[];

    public constructor();
    public constructor(indexNames: string[]);
    public constructor(indexNames: string[] = null) {
        this._indexNames = indexNames;
    }

    public getCommand(conventions: DocumentConventions): RavenCommand<IndexErrors[]> {
        return new GetIndexErrorsCommand(this._indexNames, conventions);
    }

    public get resultType(): OperationResultType {
        return "CommandResult";
    }

}

export class GetIndexErrorsCommand extends RavenCommand<IndexErrors[]> {
    private readonly _indexNames: string[];
    private readonly _conventions: DocumentConventions;

    public constructor(indexNames: string[], conventions: DocumentConventions) {
        super();
        this._indexNames = indexNames;
        this._conventions = conventions;
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        let uri = node.Url + "/databases/" + node.Database + "/indexes/errors";

        if (this._indexNames && this._indexNames.length) {
            uri += "?";

            for (const indexName of this._indexNames) {
                uri += "&name=" + this._urlEncode(indexName);
            }
        }

        return { uri };
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        const typeInfo = {
            nestedTypes: {
                "Results[].Errors[].Timestamp": "date"
            }
        };

        let body: string = null;
        await this._defaultPipeline(_ => body = _).process(bodyStream)
            .then(results => {
                this.result = this._reviveResultTypes(results, this._conventions, typeInfo)["Results"];
            });
        return body;
    }

    public get isReadRequest(): boolean {
        return true;
    }
}
