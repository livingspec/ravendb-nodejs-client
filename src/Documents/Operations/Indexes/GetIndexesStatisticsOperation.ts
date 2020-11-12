import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { IMaintenanceOperation, OperationResultType } from "../OperationAbstractions";
import { IndexStats, CollectionStats } from "../../Indexes/IndexStats";
import { HttpRequestParameters } from "../../../Primitives/Http";
import { ServerNode } from "../../../Http/ServerNode";
import { RavenCommand } from "../../../Http/RavenCommand";
import * as stream from "readable-stream";

export class GetIndexesStatisticsOperation implements IMaintenanceOperation<IndexStats[]> {

    public get resultType(): OperationResultType {
        return "CommandResult";
    }

    public getCommand(conventions: DocumentConventions): RavenCommand<IndexStats[]> {
        return new GetIndexesStatisticsCommand(conventions);
    }

}

const typeInfo = {
    nestedTypes: {
        "Results[].Collections": "Map",
        "Results[].Collections$MAP": "CollectionStats"
    }
};

const knownTypes = new Map([[CollectionStats.name, CollectionStats]]);

export class GetIndexesStatisticsCommand extends RavenCommand<IndexStats[]> {
    private readonly _conventions: DocumentConventions;
    public constructor(conventions: DocumentConventions) {
        super();
        this._conventions = conventions;
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        const uri = node.Url + "/databases/" + node.Database + "/indexes/stats";
        return { uri };
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        let body: string = null;
        await this._defaultPipeline(_ => body = _).process(bodyStream)
            .then(results => {
                for (const r of results["Results"]) {
                    r.Collections = Object.keys(r.Collections)
                        .reduce((result, next) => [ ...result, [ next, result[next] ]], []);
                }

                const obj = this._reviveResultTypes(
                    results,
                    this._conventions, 
                    typeInfo, 
                    knownTypes);

                this.result = obj["Results"];
            });
        return body;
    }

    public get isReadRequest(): boolean {
        return true;
    }
}
