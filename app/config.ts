import * as path from "path";

require("dotenv").config({
	path: path.join(__dirname, "../.env"),
});

export const config = {
	port: +process.env.SERVER_PORT,
	database: {
		type: process.env.DB_TYPE,
		host: process.env.DB_HOST,
		username: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: +process.env.DB_PORT,
		dbname: process.env.DB_NAME,
	},
	stripe_sec_key: process.env.STRIPE_KEY,
	tax_id: process.env.STRIPE_TAX,
	jwtKey: process.env.JWT_ENCRYPTION_KEY,
	reportToken: process.env.REPORT_UPDATE_API_TOKEN,
};
