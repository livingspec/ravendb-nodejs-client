import { SetupDocumentBase } from "../../SetupDocumentBase";
import { ObjectUtil } from "../../../Utility/ObjectUtil";

export class MoreLikeThisStopWords extends SetupDocumentBase {
    public Id: string;
    public StopWords: string[];

    public toRemoteFieldNames() {
        return ObjectUtil.transformObjectKeys(this, { defaultTransform: "pascal" });
    }
}
