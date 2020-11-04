import { OngoingTask } from "./OngoingTask";


export interface OngoingTaskPullReplicationAsSink extends OngoingTask {
    TaskType: "PullReplicationAsSink";

    hubDefinitionName: string;
    destinationUrl: string;
    topologyDiscoveryUrls: string[];
    destinationDatabase: string;
    connectionStringName: string;
    certificatePublicKey: string;
}