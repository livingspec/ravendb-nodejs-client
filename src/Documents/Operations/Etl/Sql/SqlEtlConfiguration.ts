import { EtlConfiguration } from "../EtlConfiguration";
import { SqlEtlTable, serializeSqlEtlTable } from "./SqlEtlTable";
import { SqlConnectionString, EtlType } from "../ConnectionString";
import { DocumentConventions } from "../../../Conventions/DocumentConventions";

export class SqlEtlConfiguration extends EtlConfiguration<SqlConnectionString> {
    public ParameterizeDeletes: boolean;
    public ForceQueryRecompile: boolean;
    public QuoteTables: boolean;
    public CommandTimeout: number;
    public SqlTables: SqlEtlTable[];

    public get etlType(): EtlType {
        return "Sql";
    }

    serialize(conventions: DocumentConventions): object {
        const result = super.serialize(conventions) as any;
        result.ParameterizeDeletes = this.ParameterizeDeletes;
        result.ForceQueryRecompile = this.ForceQueryRecompile;
        result.QuoteTables = this.QuoteTables;
        result.CommandTimeout = this.CommandTimeout;
        result.EtlType = this.etlType;
        result.SqlTables = this.SqlTables?.map(x => serializeSqlEtlTable(x))
        return result;
    }
}