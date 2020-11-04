export class ClusterTopology {

    public LastNodeId: string;
    public TopologyId: string;
    public Etag: number;

    public Members: { [key: string]: string };
    public Promotables: { [key: string]: string };
    public Watchers: { [key: string]: string };

    public contains(node: string) {
        if (this.Members && this.Members[node]) {
            return true;
        }
        if (this.Promotables && this.Promotables[node]) {
            return true;
        }

        return this.Watchers && this.Watchers[node];
    }

    public getUrlFromTag(tag: string): string {
        if (!tag) {
            return null;
        }

        if (this.Members && this.Members[tag]) {
            return this.Members[tag];
        }

        if (this.Promotables && this.Promotables[tag]) {
            return this.Promotables[tag];
        }

        if (this.Watchers && this.Watchers[tag]) {
            return this.Watchers[tag];
        }

        return null;
    }

    public getAllNodes(): { [tag: string]: string } {
        return Object.assign({}, this.Members, this.Promotables, this.Watchers);
    }
}
