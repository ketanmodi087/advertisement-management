import mongoose, { Schema, Document } from "mongoose";

export interface Campaign extends Document {
	name: string;
	user_id: string;
	placement: string;
	countries: [];
	objectives: [];
	interest_categories: [];
	device_targeting: [];
	number_of_impression: string;
	time_frame: string;
	total_budget: number;
	daily_budget: number;
	cpm_bid: number;
	creative: [];
	utm_url: {};
	is_active: boolean;
	rejected_reason: string;
	status: string;
	request_type: string;
	cpc: string;
	impressions: string;
	ctr: string;
	channel: string;
	commission: number;
	balance: number;
	spent: number;
	is_deleted: boolean;
	approved_by: boolean;
	approved_date: Date;
	bitmedia_status: string;
	gam: {};
	previous_campaign_values: {};
}

const CampaignSchema: Schema = new Schema(
	{
		name: { type: String, required: false },
		user_id: { type: String, required: true },
		placement: { type: String, required: false },
		countries: { type: [String], require: false },
		objectives: { type: [String], require: false },
		interest_categories: { type: [String], require: false },
		device_targeting: { type: [String], require: false },
		number_of_impression: { type: String, require: false },
		time_frame: { type: String, require: false },
		total_budget: { type: Number, require: false },
		daily_budget: { type: Number, require: false },
		cpm_bid: { type: Number, require: false },
		creative: { type: [String], require: false },
		utm_url: {
			type: {},
			require: false,
		},
		is_active: { type: Boolean, default: false },
		rejected_reason: { type: String, required: false },
		status: { type: String, required: false },
		request_type: { type: String, required: false },
		cpc: { type: String, required: false },
		impressions: { type: String, required: false },
		ctr: { type: String, required: false },
		channel: { type: String, required: false },
		commission: { type: Number, required: true },
		balance: { type: Number, required: true },
		spent: { type: Number, required: true },
		is_deleted: { type: Boolean, default: false },
		approved_by: { type: String, default: false },
		approved_date: { type: Date, required: false },
		bitmedia_status: { type: String, required: false },
		gam: { type: {}, required: false },
		previous_campaign_values: { type: {}, required: false },
	},
	{
		timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	}
);
export default mongoose.model<Campaign>("Campaigns", CampaignSchema);
