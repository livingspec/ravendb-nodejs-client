export type FacetTermSortMode =
    "ValueAsc"
    | "ValueDesc"
    | "CountAsc"
    | "CountDesc";

export type FacetAggregation =
    "None"
    | "Max"
    | "Min"
    | "Average"
    | "Sum";

export interface IFacetValue {
    Range: string;
    Count: number;
    Sum: number;
    Max: number;
    Min: number;
    Average: number;
}

export class FacetValue implements IFacetValue {

    public Range: string;
    public Count: number;
    public Sum: number;
    public Max: number;
    public Min: number;
    public Average: number;

    public toString() {
        return FacetValue.toString(this);
    }

    public static toString(facetVal: IFacetValue) {
        let msg = facetVal.Range + " - Count: " + facetVal.Count + ", ";
        if (facetVal.Sum) {
            msg += "Sum: " + facetVal.Sum + ",";
        }
        if (facetVal.Max) {
            msg += "Max: " + facetVal.Max + ",";
        }
        if (facetVal.Min) {
            msg += "Min: " + facetVal.Min + ",";
        }
        if (facetVal.Average) {
            msg += "Average: " + facetVal.Average + ",";
        }

        return msg.replace(/;$/, "");
    }
}

export class FacetResult {

    public Name: string;

    /**
     * The facet terms and hits up to a limit of MaxResults items (as specified in the facet setup document), sorted
     * in TermSortMode order (as indicated in the facet setup document).
     */
    public Values: FacetValue[] = [];

    /**
     * A list of remaining terms in term sort order for terms that are outside of the MaxResults count.
     */
    public RemainingTerms: string[] = [];

    /**
     * The number of remaining terms outside of those covered by the Values terms.
     */
    public RemainingTermsCount: number;

    public RemainingHits: number;
}

export interface IFacetOptions {
    termSortMode: FacetTermSortMode;
    includeRemainingTerms: boolean;
    start: number;
    pageSize: number;
}

export class FacetOptions implements IFacetOptions {
    public termSortMode: FacetTermSortMode;
    public includeRemainingTerms: boolean;
    public start: number;
    public pageSize: number;

    private static _defaultOptions = new FacetOptions();

    public static getDefaultOptions(): IFacetOptions {
        return this._defaultOptions;
    }
}
