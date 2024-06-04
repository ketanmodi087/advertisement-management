import mongoose, { Schema, Document } from "mongoose";

export interface Analytic extends Document {
	campaign_id: string;
	creative_id: string;
	creativeName: string;
	creativeSize: string;
	date: Date;
	country: string;
	impressions: number;
	uniqueImpressions: number;
	clicks: number;
	spends: number;
	ctr: number;
	cpm: number;
	desktopImpressionsPercent: number;
	mobileImpressionsPercent: number;
	deviceCategory: string;
}

const AnalyticSchema: Schema = new Schema(
	{
		campaign_id: { type: String, required: true },
		creative_id: { type: String, required: true },
		creativeName: { type: String, required: true },
		creativeSize: { type: String, required: true },
		date: { type: Date, required: false },
		country: { type: String, required: true },
		impressions: { type: Number, require: true },
		uniqueImpressions: { type: Number, require: false },
		clicks: { type: Number, require: true },
		spends: { type: Number, require: true },
		ctr: { type: Number, require: true },
		cpm: { type: Number, require: true },
		desktopImpressionsPercent: { type: Number, require: false },
		created_at: { type: Date, require: false },
		updated_at: { type: Date, require: false },
		mobileImpressionsPercent: { type: Number, require: false },
		deviceCategory: { type: String, require: false },
	}
	// {
	// 	timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	// }
);
export default mongoose.model<Analytic>("Analytic", AnalyticSchema);
