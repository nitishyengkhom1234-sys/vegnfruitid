import { PRODUCE } from "./constants";

export type ProduceKey = typeof PRODUCE[number]['value'];

export interface ProduceItem {
    value: ProduceKey;
    label: string;
    icon: string;
}

export interface PredictionResult {
    days: number;
    status: 'Unripe' | 'Nearing Ripeness' | 'Ripe' | 'Overripe' | 'Damaged';
    recommendation: string;
    infection_details: {
        type: string;
        name: string;
        cause: string;
    };
    isPartlyMissing: boolean;
    missingPartDescription: string;
}