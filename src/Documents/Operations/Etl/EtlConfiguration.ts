import { Transformation, serializeTransformation } from "./Transformation";
import { ConnectionString } from "./ConnectionString";
import { DocumentConventions } from "../../Conventions/DocumentConventions";

export class EtlConfiguration<T extends ConnectionString> {
    public TaskId: number;
    public Name: string;
    public MentorNode: string;
    public ConnectionStringName: string;
    public Transforms: Transformation[];
    public Disabled: boolean;
    public AllowEtlOnNonEncryptedChannel: boolean;

    public serialize(conventions: DocumentConventions): object {
        return {
            TaskId: this.TaskId,
            Name: this.Name,
            MentorName: this.MentorNode,
            ConnectionStringName: this.ConnectionStringName,
            Transforms: this.Transforms.map(x => serializeTransformation(x)),
            Disabled: this.Disabled,
            AllowEtlOnNonEncryptedChannel: this.AllowEtlOnNonEncryptedChannel
        }
    }
}