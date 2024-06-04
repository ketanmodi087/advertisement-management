import { Resolver, Query, Ctx } from "type-graphql";
import { CountriesListType } from "../type/index";
const admin = require("firebase-admin");
import data from "../../countries.json";
import { verifyToken, errorResonse } from "../helper";

@Resolver()
export class CountriesResolver {
	@Query((returns) => CountriesListType)
	async countriesList(@Ctx() { req, parent, _token }) {
		await verifyToken(_token);
		try {
			const CountriesList = await data.countriesList;
			const countryArray = [];
			const subRegion = await data.subRegion;
			await Promise.all(
				CountriesList.map((country) => {
					const coordinates = [country.longitude, country.latitude];
					const countryObj = {
						name: country.name,
						coordinates: coordinates,
						region: country.region,
						subregion: country.subregion,
					};
					countryArray.push(countryObj);
				})
			);
			const response = {
				countries: countryArray,
				subregion: subRegion,
			};
			return response;
		} catch (err) {
			let errorMgs = "Countries list not found";
			await errorResonse(errorMgs, err);
		}
	}
}
