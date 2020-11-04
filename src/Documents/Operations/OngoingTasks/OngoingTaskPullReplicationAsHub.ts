import { OngoingTask } from "./OngoingTask";

export interface OngoingTaskPullReplicationAsHub extends OngoingTask {
    TaskType: "PullReplicationAsHub";

    destinationUrl: string;
    destinationDatabase: string;
    delayReplicationFor: string;
}
