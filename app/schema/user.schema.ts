import mongoose, { Schema, Document } from "mongoose";

export interface User extends Document {
	full_name: string;
	parent_id: string;
	email: string;
	password: string;
	user_type: string;
	profile_image: string;
	dial_code: string;
	phone: string;
	preferred_messenger: string;
	messenger: string;
	deposit_amount: number;
	spent_amount: number;
	available_balance: number;
	commission: number;
	status: string;
	stripe_customer_id: string;
	_token: string;
	fuid: string;
	isNewUser: boolean;
	created_at?: Date;
	updated_at?: Date;
}

const UserSchema: Schema = new Schema(
	{
		full_name: { type: String, required: false },
		parent_id: { type: String, required: false },
		email: { type: String, required: false, unique: true },
		password: { type: String, required: false },
		user_type: {
			type: String,
			required: false,
			enum: ["superadmin", "admin", "customer"],
		},
		profile_image: { type: String, required: false },
		dial_code: { type: String, required: false },
		phone: { type: String, required: false },
		preferred_messenger: { type: String, required: false },
		messenger: { type: String, required: false, default: "" },
		deposit_amount: { type: Number, required: false },
		spent_amount: { type: Number, required: false },
		available_balance: { type: Number, required: false },
		commission: { type: Number, required: false, default: 30 },
		status: { type: String, required: false, enum: ["active", "inactive"] },
		stripe_customer_id: { type: String, required: false },
		_token: { type: String },
		fuid: { type: String },
		isNewUser: { type: Boolean, required: false },
	},
	{
		timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	}
);

export default mongoose.model<User>("User", UserSchema);
