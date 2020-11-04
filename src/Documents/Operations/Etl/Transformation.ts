
export class Transformation {
    Name: string;
    Disabled?: boolean;
    Collections?: string[];
    ApplyToAllDocuments?: boolean;
    Script?: string;
}

export function serializeTransformation(transformation: Transformation) {
    return {
        Name: transformation.Name,
        Disabled: transformation.Disabled,
        Collections: transformation.Collections,
        ApplyToAllDocuments: transformation.ApplyToAllDocuments,
        Script: transformation.Script
    }
}