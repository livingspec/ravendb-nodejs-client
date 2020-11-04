export type ConnectionStringType =
    "None" |
    "Raven" |
    "Sql";

export abstract class ConnectionString {
    public Name: string;
    public abstract Type: ConnectionStringType;
}

export class RavenConnectionString extends ConnectionString {
    public Database: string;
    public TopologyDiscoveryUrls: string[];
    public Type: ConnectionStringType = "Raven";
}

export class SqlConnectionString extends ConnectionString {
    public ConnectionString: string;
    public FactoryName: string;
    public Type: ConnectionStringType = "Sql";
}

export type EtlType =
    "Raven"
    | "Sql";