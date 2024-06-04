import "reflect-metadata";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginLandingPageGraphQLPlayground } from "@apollo/server-plugin-landing-page-graphql-playground";
import express from "express";
import cors from "cors";
import { json } from "body-parser";
import * as path from "path";
import { buildSchema } from "type-graphql";
import {
	UserResolver,
	CreativeResolver,
	TransactionResolver,
	ObjectiveResolver,
	InterestingCategoryResolver,
	CampaignResolver,
	CountriesResolver,
	BitMediaResolver,
	GlobalSearchResolver,
	DashboardResolver,
	ReportsResolver,
} from "./resolvers/index";
import { config } from "./config";
import { connection } from "./connection";
const admin = require("firebase-admin");

const startServer = async () => {
	connection();
	const schema = await buildSchema({
		resolvers: [
			UserResolver,
			CreativeResolver,
			TransactionResolver,
			ObjectiveResolver,
			InterestingCategoryResolver,
			CampaignResolver,
			CountriesResolver,
			BitMediaResolver,
			GlobalSearchResolver,
			DashboardResolver,
			ReportsResolver,
		],
	});
	const app = express();

	const apolloServer = new ApolloServer({
		schema,
		plugins: [ApolloServerPluginLandingPageGraphQLPlayground()],
	});
	await apolloServer.start();
	app.use(
		"/graphql",
		cors<cors.CorsRequest>(),
		json(),
		expressMiddleware(apolloServer, {
			context: async ({ req, res }) => {
				let parent = {};
				const tokenWithBearer = req.headers.authorization || "";
				const _token = tokenWithBearer && tokenWithBearer.split(" ")[1];
				return { req, parent, _token };
			},
		})
	);

	// apolloServer.applyMiddleware({ app });
	app.get("/uploads/*", function (req, res) {
		res.sendFile(path.resolve(__dirname + "/../" + req.url));
	});
	app.listen(config.port, () => {
		admin.initializeApp();
		console.log(`server started on ${config.port}....`);
	});
};
startServer();
