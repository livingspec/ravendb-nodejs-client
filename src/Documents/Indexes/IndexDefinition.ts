import { throwError } from "../../Exceptions/index";
import { IndexPriority, FieldStorage, FieldIndexing, FieldTermVector, IndexLockMode, IndexType } from "./Enums";
import { IndexFieldOptions } from "./IndexFieldOptions";
import { SpatialOptions } from "./Spatial";
import { DocumentConventions } from "../Conventions/DocumentConventions";
import { IndexDefinitionHelper } from "./IndexDefinitionHelper";

export interface IndexConfiguration {
    [key: string]: string;
}

export class IndexDefinition {

    public Name: string;
    public Priority: IndexPriority;

    /**
     * Index lock mode:
     * - Unlock - all index definition changes acceptable
     * - LockedIgnore - all index definition changes will be ignored, only log entry will be created
     * - LockedError - all index definition changes will raise exception
     */
    public LockMode: IndexLockMode;
    public IndexType: IndexType;
    public AdditionalSources: { [key: string]: string } = {};
    public Maps: Set<string> = new Set();
    public Reduce: string;
    public Fields: { [fieldName: string]: IndexFieldOptions } = {};
    public Configuration: IndexConfiguration = {};
    public OutputReduceToCollection: string;
    public ReduceOutputIndex: number;
    public PatternForOutputReduceToCollectionReferences: string;
    public PatternReferencesCollectionName: string;

    public toString(): string {
        return this.Name;
    }

    public get type(): IndexType {
        if (!this.IndexType || this.IndexType === "None") {
            this.IndexType = this.detectStaticIndexType();
        }

        return this.IndexType;
    }

    public set type(indexType) {
        this.IndexType = indexType;
    }

    public detectStaticIndexType(): IndexType {
        const firstMap = this.Maps.values().next().value;

        if (!firstMap) {
            throwError("InvalidArgumentException", "Index  definitions contains no Maps");
        }

        return IndexDefinitionHelper.detectStaticIndexType(firstMap, this.Reduce);
    }
}

export class IndexDefinitionBuilder {

    public indexName: string;
    public map: string;
    public reduce: string;
    public priority: IndexPriority;
    public lockMode: IndexLockMode;
    public storesStrings: { [key: string]: FieldStorage };
    public indexesStrings: { [key: string]: FieldIndexing };
    public analyzersStrings: { [key: string]: string };
    public suggestionsOptions: Set<string>;
    public termVectorsStrings: { [key: string]: FieldTermVector };
    public spatialIndexesStrings: { [key: string]: SpatialOptions };
    public outputReduceToCollection: string;
    public patternForOutputReduceToCollectionReferences: string;
    public patternReferencesCollectionName: string;
    public additionalSources: { [key: string]: string };
    public configuration: IndexConfiguration;

    public constructor(indexName?: string) {
        this.indexName = indexName || this.constructor.name;
        if (this.indexName.length > 256) {
            throwError("InvalidArgumentException",
                "The index name is limited to 256 characters, but was: " + this.indexName);
        }
        this.storesStrings = {};
        this.indexesStrings = {};
        this.suggestionsOptions = new Set();
        this.analyzersStrings = {};
        this.termVectorsStrings = {};
        this.spatialIndexesStrings = {};
        this.configuration = {};
    }

    public toIndexDefinition(conventions: DocumentConventions, validateMap?: boolean): IndexDefinition {
        if (!this.map && validateMap) {
            throwError("InvalidOperationException",
                "Map is required to generate an index, "
                + " you cannot create an index without a valid Map property (in index "
                + this.indexName + ").");
        }

        try {
            const indexDefinition = new IndexDefinition();
            indexDefinition.Name = this.indexName;
            indexDefinition.Reduce = this.reduce;
            indexDefinition.LockMode = this.lockMode;
            indexDefinition.Priority = this.priority;
            indexDefinition.OutputReduceToCollection = this.outputReduceToCollection;
            indexDefinition.PatternForOutputReduceToCollectionReferences = this.patternForOutputReduceToCollectionReferences;
            indexDefinition.PatternReferencesCollectionName = this.patternReferencesCollectionName;

            const suggestions: { [suggestionOption: string]: boolean } = Array.from(this.suggestionsOptions)
                .reduce((result, item) =>
                    Object.assign(result, { [item]: true }), {});

            this._applyValues(indexDefinition, this.indexesStrings,
                (options, value) => options.indexing = value);
            this._applyValues(indexDefinition, this.storesStrings,
                (options, value) => options.storage = value);
            this._applyValues(indexDefinition, this.analyzersStrings,
                (options, value) => options.analyzer = value);
            this._applyValues(indexDefinition, this.termVectorsStrings,
                (options, value) => options.termVector = value);
            this._applyValues(indexDefinition, this.spatialIndexesStrings,
                (options, value) => options.spatial = value);
            this._applyValues(indexDefinition, suggestions,
                (options, value) => options.suggestions = value);

            if (this.map) {
                indexDefinition.Maps.add(this.map);
            }

            indexDefinition.AdditionalSources = this.additionalSources;
            indexDefinition.Configuration = this.configuration;
            return indexDefinition;
        } catch (err) {
            throwError("IndexCompilationException", "Failed to create index " + this.indexName, err);
        }
    }

    private _applyValues<T>(
        indexDefinition: IndexDefinition,
        values: { [fieldName: string]: T },
        action: (options: IndexFieldOptions, val: T) => void) {

        for (const fieldName of Object.keys(values)) {
            const fieldVal: T = values[fieldName];
            const field = indexDefinition.Fields[fieldName] =
                indexDefinition.Fields[fieldName] || new IndexFieldOptions();

            action(field, fieldVal);
        }
    }
}
