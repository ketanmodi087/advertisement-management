import { Resolver, Query, Ctx } from "type-graphql";
import { ObjectiveListType } from "../type/index";
import { Objectives } from "../schema/index";
import { verifyToken, errorResonse } from "../helper";
const admin = require("firebase-admin");

@Resolver()
export class ObjectiveResolver {
	@Query((returns) => ObjectiveListType)
	async objectiveList(@Ctx() { req, parent, _token }) {
		await verifyToken(_token);
		try {
			let objectives = await Objectives.find();
			const response = {
				objectives: objectives,
			};
			return response;
		} catch (err) {
			let errorMgs = "Objective list not found.";
			await errorResonse(errorMgs, err);
		}
	}
}
