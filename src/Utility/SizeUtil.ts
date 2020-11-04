export class Size {
    private _SizeInBytes: number;
    private _HumaneSize: string;

    public get SizeInBytes(): number {
        return this._SizeInBytes;
    }

    public get HumaneSize(): string {
        return this._HumaneSize;
    }

    public set SizeInBytes(value: number) {
        this._SizeInBytes = value;
    }

    public set HumaneSize(value: string) {
        this._HumaneSize = value;
    }
}
