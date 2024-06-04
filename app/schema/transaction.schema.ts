import mongoose, { Schema, Document } from "mongoose";

export interface Transaction extends Document {
	user_id: string;
	amount: number;
	type: string;
	payment_response: any;
	created_at?: Date;
	updated_at?: Date;
	users: any;
}

const TransactionSchema: Schema = new Schema(
	{
		user_id: { type: String, required: false },
		amount: { type: Number, required: false },
		type: { type: String, required: false },
		payment_response: {
			type: mongoose.Schema.Types.Mixed,
			required: false,
		},
		checkout_id: { type: String, required: false },
		users: [],
		transaction_type: { type: String, required: false },
		campaign_response: {
			type: mongoose.Schema.Types.Mixed,
			required: false,
		},
	},
	{
		timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	}
);

export default mongoose.model<Transaction>("Transaction", TransactionSchema);
