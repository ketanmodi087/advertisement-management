import mongoose, { Schema, Document } from "mongoose";

export interface Creative extends Document {
	name: string;
	url: string;
	creative_type: string;
	preview_url: string;
	user_id: string;
	size: string;
	is_deleted: boolean;
}

const CreativeSchema: Schema = new Schema(
	{
		name: { type: String, required: true },
		url: { type: String, required: true },
		creative_type: { type: String, required: true },
		preview_url: { type: String, required: false },
		user_id: { type: String, required: true },
		size: { type: String, required: true },
		is_deleted: { type: Boolean, default: false },
	},
	{
		timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	}
);

export default mongoose.model<Creative>("Creative", CreativeSchema);
