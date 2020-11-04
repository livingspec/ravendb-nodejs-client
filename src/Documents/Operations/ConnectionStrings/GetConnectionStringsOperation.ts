import { HttpRequestParameters } from "../../../Primitives/Http";
import * as stream from "readable-stream";
import { ConnectionStringType, SqlConnectionString, RavenConnectionString } from "../Etl/ConnectionString";
import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { OperationResultType, IMaintenanceOperation } from "../OperationAbstractions";
import { RavenCommand } from "../../../Http/RavenCommand";
import { ServerNode } from "../../../Http/ServerNode";

export interface GetConnectionStringsResult {
    RavenConnectionStrings: Record<string, RavenConnectionString>;
    SqlConnectionStrings: Record<string, SqlConnectionString>;
}

export class GetConnectionStringsOperation implements IMaintenanceOperation<GetConnectionStringsResult> {
    private readonly _connectionStringName: string;
    private readonly _type: ConnectionStringType;

    public constructor()
    public constructor(connectionStringName: string, type: ConnectionStringType)
    public constructor(connectionStringName?: string, type?: ConnectionStringType) {
        this._connectionStringName = connectionStringName;
        this._type = type;
    }

    getCommand(conventions: DocumentConventions): RavenCommand<GetConnectionStringsResult> {
        return new GetConnectionStringCommand(this._connectionStringName, this._type);
    }

    public get resultType(): OperationResultType {
        return "CommandResult";
    }
}

export class GetConnectionStringCommand extends RavenCommand<GetConnectionStringsResult> {
    private readonly _connectionStringName: string;
    private readonly _type: ConnectionStringType;

    public constructor(connectionStringName: string, type: ConnectionStringType) {
        super();
        this._connectionStringName = connectionStringName;
        this._type = type;
    }

    get isReadRequest(): boolean {
        return true;
    }

    createRequest(node: ServerNode): HttpRequestParameters {
        let uri = node.Url + "/databases/" + node.Database + "/admin/connection-strings";

        if (this._connectionStringName) {
            uri += "?connectionStringName=" + encodeURIComponent(this._connectionStringName) + "&type=" + this._type;
        }

        return {
            method: "GET",
            uri
        };
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            return;
        }

        let body = "";
        this.result = await this._defaultPipeline(_ => body += _).process(bodyStream);

        if (this.result.RavenConnectionStrings) {
            this.result.RavenConnectionStrings = Object.entries(this.result.RavenConnectionStrings)
                .reduce(((previousValue, currentValue) => {
                    previousValue[currentValue[0]] = Object.assign(new RavenConnectionString(), currentValue[1]);
                    return previousValue;
                }), {} as Record<string, RavenConnectionString>);
        }

        if (this.result.SqlConnectionStrings) {
            this.result.SqlConnectionStrings = Object.entries(this.result.SqlConnectionStrings)
                .reduce(((previousValue, currentValue) => {
                    previousValue[currentValue[0]] = Object.assign(new SqlConnectionString(), currentValue[1]);
                    return previousValue;
                }), {} as Record<string, SqlConnectionString>);
        }

        return body;
    }
}