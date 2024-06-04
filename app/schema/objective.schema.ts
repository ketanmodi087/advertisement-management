import mongoose, { Schema, Document } from "mongoose";

export interface Objective extends Document {
	objective_title: string;
	objective_icon: string;
	objective_description: string;
}
const ObjectiveSchema: Schema = new Schema({
	objective_title: { type: String, required: false },
	objective_icon: { type: String, required: false },
	objective_description: { type: String, required: false },
});

export default mongoose.model<Objective>("Objectives", ObjectiveSchema);
