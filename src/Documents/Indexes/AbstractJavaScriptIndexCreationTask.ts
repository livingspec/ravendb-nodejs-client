import { IndexDefinition } from "./IndexDefinition";
import { AbstractIndexCreationTaskBase } from "./AbstractIndexCreationTaskBase";

export class AbstractJavaScriptIndexCreationTask extends AbstractIndexCreationTaskBase {

    private readonly _definition: IndexDefinition = new IndexDefinition();

    protected constructor() {
        super();
    }

    public get maps() {
        return this._definition.Maps;
    }

    public set maps(value) {
        this._definition.Maps = value;
    }

    public get fields() {
        return this._definition.Fields;
    }

    public set fields(value) {
        this._definition.Fields = value;
    }

    public get reduce() {
        return this._definition.Reduce;
    }

    public set reduce(value) {
        this._definition.Reduce = value;
    }

    public get isMapReduce(): boolean {
        return !!this.reduce;
    }

    /**
     * @return If not null than each reduce result will be created as a document in the specified collection name.
     */
    public get outputReduceToCollection() {
        return this._definition.OutputReduceToCollection;
    }

    /**
     * @param value If not null than each reduce result will be created as a document in the specified collection name.
     */
    public set outputReduceToCollection(value) {
        this._definition.OutputReduceToCollection = value;
    }

    /**
     * @return Defines a collection name for reference documents created based on provided pattern
     */
    public get patternReferencesCollectionName() {
        return this._definition.PatternReferencesCollectionName;
    }

    /**
     * @param value Defines a collection name for reference documents created based on provided pattern
     */
    public set patternReferencesCollectionName(value: string) {
        this._definition.PatternReferencesCollectionName = value;
    }

    /**
     * @return Defines a collection name for reference documents created based on provided pattern
     */
    public get patternForOutputReduceToCollectionReferences() {
        return this._definition.PatternForOutputReduceToCollectionReferences;
    }

    /**
     * @param value Defines a collection name for reference documents created based on provided pattern
     */
    public set patternForOutputReduceToCollectionReferences(value: string) {
        this._definition.PatternForOutputReduceToCollectionReferences = value;
    }

    public createIndexDefinition(): IndexDefinition {
        this._definition.type = this.isMapReduce ? "JavaScriptMapReduce" : "JavaScriptMap";
        this._definition.Name = this.getIndexName();

        if (this.additionalSources) {
            this._definition.AdditionalSources = this.additionalSources;
        } else {
            this._definition.AdditionalSources = {};
        }
        this._definition.Configuration = this.configuration;
        this._definition.LockMode = this.lockMode;
        this._definition.Priority = this.priority;

        return this._definition;
    }
}
