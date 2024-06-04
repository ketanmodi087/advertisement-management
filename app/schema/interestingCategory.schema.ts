import mongoose, { Schema, Document } from "mongoose";

export interface InterestingCategory extends Document {
	interest_category_label: string;
	interest_category_img: string;
}
const InterestingCategorySchema: Schema = new Schema({
	interest_category_label: { type: String, required: false },
	interest_category_img: { type: String, required: false },
});

export default mongoose.model<InterestingCategory>(
	"InterestingCategory",
	InterestingCategorySchema
);
