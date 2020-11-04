import { LogMode } from "./LogMode";

export interface GetLogsConfigurationResult {
    CurrentMode: LogMode;
    Mode: LogMode;
    Path: string;
    UseUtcTime: boolean;
    RetentionTime: string;
    RetentionSize: number;
    Compress: boolean;
}