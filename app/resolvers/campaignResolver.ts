import { ObjectId } from "mongodb";
import { Resolver, Arg, Mutation, Ctx, Query } from "type-graphql";
import { CampaignType } from "../type/index";
import {
	Campaign,
	User,
	Transaction,
	Analytic,
	Creative,
} from "../schema/index";
import GraphQLJSON from "graphql-type-json";
import { CampaignListType } from "../type/CampaignListType";
import { CustomResponseType } from "../type/CustomResponseType";
import {
	USER_TYPE,
	CAMPAIGN_STATUS,
	CAMPAIGN_CHANNEL,
	CAMPAIGN_STATUS_REQUEST,
} from "./../constant/enum";
import { verifyToken, errorResonse } from "../helper";
import {
	createCampaignInGAM,
	updateCampaignInGAM,
} from "../services/google-ad-manager/campaignService";
import countryData from "../../countries.json";
import { CampaignActions } from "../services/google-ad-manager/approvalService";
import {
	sendCampaignApprovedWebhook,
	sendCampaignPausedWebhook,
	sendCampaignRejectedWebhook,
	sendCampaignResumedWebhook,
	sendManualChannelUpdateRequestWebhook,
	sendNewCampaignRequestWebhook,
	sendUpdateCampaignRequestWebhook,
} from "../services/zapier/webHookService";
import { campaignPreviousValuesMapper } from "../util/objectMapper";

@Resolver()
export class CampaignResolver {
	@Mutation((returns) => CampaignType)
	async addCampaign(
		@Ctx() { req, parent, _token },
		@Arg("name", { nullable: false }) name: string,
		@Arg("placement", { nullable: false }) placement: string,
		@Arg("countries", (type) => [GraphQLJSON], { nullable: false })
		countries: [any],
		@Arg("objectives", (type) => [GraphQLJSON], { nullable: false })
		objectives: [any],
		@Arg("interest_categories", (type) => [GraphQLJSON], {
			nullable: false,
		})
		interest_categories: [any],
		@Arg("device_targeting", (type) => [GraphQLJSON], { nullable: false })
		device_targeting: [any],
		@Arg("number_of_impression", { nullable: false })
		numberOfImpression: string,
		@Arg("time_frame", { nullable: false }) timeFrame: string,
		@Arg("total_budget", { nullable: true }) totalBudget: number,
		@Arg("daily_budget", { nullable: true }) dailyBudget: number,
		@Arg("cpm_bid", { nullable: true }) cpmBid: number,
		@Arg("creative", (type) => [GraphQLJSON], { nullable: false })
		creative: [any],
		@Arg("utm_url", { nullable: false }) utm_url: string,
		@Arg("is_active", { nullable: false }) is_active: boolean,
		@Arg("rejected_reason", { nullable: false }) rejected_reason: string,
		@Arg("commission", { nullable: true }) commission: number,
		@Arg("balance", { nullable: true }) balance: number,
		@Arg("spent", { nullable: true }) spent: number
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		return new Promise(async (resolve, reject) => {
			try {
				let country = JSON.parse(JSON.stringify(countries));
				let utmUrl = JSON.parse(JSON.stringify(utm_url));
				const campaignData = new Campaign({
					name: name,
					user_id: userData._id,
					placement: placement,
					countries: country,
					objectives: objectives,
					interest_categories: interest_categories,
					device_targeting: device_targeting,
					number_of_impression: numberOfImpression,
					time_frame: timeFrame,
					total_budget: balance,
					daily_budget: dailyBudget,
					cpm_bid: cpmBid,
					creative: creative,
					utm_url: utmUrl,
					channel: "",
					status: CAMPAIGN_STATUS.PENDING,
					cpc: "",
					impressions: "",
					ctr: "",
					is_active: is_active,
					rejected_reason: rejected_reason,
					commission: commission ? commission : userData.commission,
					balance: balance,
					spent: spent,
				});

				// User balance deducted and add data into transaction
				if (balance && Number.isInteger(balance)) {
					if (Number(userData.available_balance) >= Number(balance)) {
						let result = await campaignData.save();

						let userBalance =
							Number(userData.available_balance) -
							Number(balance);
						userData.available_balance = userBalance;
						await userData.save();

						let campaign_response = {
							name: result.name,
							id: result._id,
							amount: result.balance,
							utm_url: result.utm_url,
						};
						const transactionData = await new Transaction({
							user_id: userData._id,
							amount: balance,
							type: "debit",
							transaction_type: "internal",
							payment_response: null,
							checkout_id: null,
							campaign_response: campaign_response,
						});
						await transactionData.save();

						//Add data into analytics table
						const CountriesList = await countryData.countriesList;

						if (creative.length > 0) {
							for (let createCreative in creative) {
								const creativeData = await Creative.findById(
									creative[createCreative]
								)
									.then((docs) => {
										return docs;
									})
									.catch((err) => {
										console.log(err);
									});
								if (countries.length > 0) {
									for (country in countries) {
										const index =
											await CountriesList.findIndex(
												(object) => {
													return (
														object.name ===
														countries[country]
													);
												}
											);

										const analyticsData = new Analytic({
											country: CountriesList[index].iso2,
											creative_id:
												creative[createCreative],
											date: new Date(),
											campaign_id: result?._id,
											clicks: 0,
											cpm: 0,
											ctr: 0,
											spends: 0,
											desktopImpressionsPercent: 0,
											impressions: 0,
											mobileImpressionsPercent: 0,
											uniqueImpressions: 0,
											creativeName: creativeData["name"],
											creativeSize: creativeData["size"],
										});
										await analyticsData.save();
									}
								} else {
									const analyticsData = new Analytic({
										country: "",
										creative_id: createCreative,
										date: new Date(),
										campaign_id: result?._id,
										clicks: 0,
										cpm: 0,
										ctr: 0,
										spends: 0,
										desktopImpressionsPercent: 0,
										impressions: 0,
										mobileImpressionsPercent: 0,
										uniqueImpressions: 0,
										creativeName: creativeData["name"],
										creativeSize: creativeData["size"],
									});
									await analyticsData.save();
								}
							}
						}

						// Remove all drafts
						// await clearAllDrafts()
						//trigger to zapier for new campaign creation for further routing of notifications
						sendNewCampaignRequestWebhook(campaignData, userData);
						return resolve(result);
					} else {
						reject("Insufficient balance in your account.");
					}
				}
			} catch (err) {
				console.log(
					"try catch error while add Campaign detail ==>> ",
					err
				);
				reject(err);
			}
		}).catch(async (error) => {
			console.log("error when add Campaign:", error);
			let errorMgs =
				"New campaign not added due to insufficient balance.";
			await errorResonse(errorMgs, error);
		});
	}
	@Query((returns) => CampaignListType)
	async campaignList(
		@Ctx() { req, parent, _token },
		@Arg("user_id", { nullable: true }) user_id: string,
		@Arg("limit", { nullable: false }) limit: number,
		@Arg("page", { nullable: false }) page: number,
		@Arg("columnName", { nullable: true }) columnName: string,
		@Arg("order", { nullable: true }) order: string,
		@Arg("search", { nullable: true }) search: string,
		@Arg("status", () => [String], { nullable: true })
		status: string[],
		@Arg("objective", () => [String], { nullable: true })
		objective: string[],
		@Arg("budget", { nullable: true }) budget: boolean,
		@Arg("startDate", { nullable: true }) startDate: string,
		@Arg("endDate", { nullable: true }) endDate: string
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		try {
			// let userData;
			if (user_id) {
				userData = await User.findOne({ _id: user_id });
			}

			let searchValue = search ? search : "";
			let regex = new RegExp(searchValue, "i");
			const conditionArr = [];

			conditionArr.push({ is_deleted: false });

			if (searchValue) {
				if (ObjectId.isValid(searchValue)) {
					const objectId = new ObjectId(searchValue);
					conditionArr.push({ _id: objectId });
				} else {
					conditionArr.push({
						$or: [{ name: regex }, { user_id: regex }],
					});
				}
			}

			if (status && status.length) {
				conditionArr.push({ status: { $in: status } });
			}
			if (objective && objective.length) {
				conditionArr.push({ objectives: { $in: objective } });
			}
			if (budget) {
				conditionArr.push({ total_budget: { $lt: 500 } });
			}

			if (startDate && endDate) {
				conditionArr.push({
					created_at: {
						$gte: new Date(startDate + " 00:00:00"),
						$lte: new Date(endDate + " 23:59:59"),
					},
				});
			}
			let CampaignsData;
			if (conditionArr.length > 0) {
				if (
					userData.user_type === USER_TYPE.ADMIN ||
					userData.user_type === USER_TYPE.SUPER_ADMIN
				) {
					CampaignsData = await Campaign.aggregate(
						[
							{
								$match: {
									$and: conditionArr,
								},
							},
							{
								$addFields: {
									user_id: { $toObjectId: "$user_id" },
								},
							},
							{
								$lookup: {
									from: "users",
									let: { userId: "$user_id" },
									pipeline: [
										{
											$match: {
												$expr: {
													$eq: ["$_id", "$$userId"],
												},
											},
										},
										{
											$project: {
												_id: 1,
												email: 1,
												full_name: 1,
												profile_image: 1,
											},
										},
									],
									as: "userdetails",
								},
							},
							{
								$project: {
									countries: 0,
									gam: 0,
									creative: 0,
									rejected_reason: 0,
									is_deleted: 0,
									// request_type: 0,
									spent: 0,
								},
							},
						],
						function (err, response) {
							if (err) throw err;
							return response;
						}
					);
				} else {
					CampaignsData = await Campaign.aggregate(
						[
							{
								$match: {
									user_id: userData._id.toHexString(),
									$and: conditionArr,
								},
							},
							{
								$addFields: {
									user_id: { $toObjectId: "$user_id" },
								},
							},
							{
								$lookup: {
									from: "users",
									let: { userId: "$user_id" },
									pipeline: [
										{
											$match: {
												$expr: {
													$eq: ["$_id", "$$userId"],
												},
											},
										},
										{
											$project: {
												_id: 1,
												email: 1,
												full_name: 1,
												profile_image: 1,
											},
										},
									],
									as: "userdetails",
								},
							},
							{
								$project: {
									countries: 0,
									gam: 0,
									creative: 0,
									rejected_reason: 0,
									is_deleted: 0,
									// request_type: 0,
									spent: 0,
								},
							},
						],
						function (err, response) {
							if (err) throw err;
							return response;
						}
					);
				}
			} else {
				if (
					userData.user_type === USER_TYPE.ADMIN ||
					userData.user_type === USER_TYPE.SUPER_ADMIN
				) {
					CampaignsData = await Campaign.aggregate(
						[
							{
								$addFields: {
									user_id: { $toObjectId: "$user_id" },
								},
							},
							{
								$lookup: {
									from: "users",
									let: { userId: "$user_id" },
									pipeline: [
										{
											$match: {
												$expr: {
													$eq: ["$_id", "$$userId"],
												},
											},
										},
										{
											$project: {
												_id: 1,
												email: 1,
												full_name: 1,
												profile_image: 1,
											},
										},
									],
									as: "userdetails",
								},
							},
							{
								$project: {
									countries: 0,
									gam: 0,
									creative: 0,
									rejected_reason: 0,
									is_deleted: 0,
									// request_type: 0,
									spent: 0,
								},
							},
						],
						function (err, response) {
							if (err) throw err;
							return response;
						}
					);
				} else {
					CampaignsData = await Campaign.aggregate(
						[
							{
								$match: {
									user_id: userData._id.toHexString(),
								},
							},
							{
								$addFields: {
									user_id: { $toObjectId: "$user_id" },
								},
							},
							{
								$lookup: {
									from: "users",
									let: { userId: "$user_id" },
									pipeline: [
										{
											$match: {
												$expr: {
													$eq: ["$_id", "$$userId"],
												},
											},
										},
										{
											$project: {
												_id: 1,
												email: 1,
												full_name: 1,
												profile_image: 1,
											},
										},
									],
									as: "userdetails",
								},
							},
							{
								$project: {
									countries: 0,
									gam: 0,
									creative: 0,
									rejected_reason: 0,
									is_deleted: 0,
									// request_type: 0,
									spent: 0,
								},
							},
						],
						function (err, response) {
							if (err) throw err;
							return response;
						}
					);
				}
			}

			//Budget spend,Budget remaining,cpc,ctr

			let newCampaignList = [];
			for (let i = 0; i < CampaignsData.length; i++) {
				const object = CampaignsData[i];
				const campaignId = object?._id.toString();
				const analyticsData = await Analytic.aggregate([
					{
						$match: {
							campaign_id: campaignId,
						},
					},
					{
						$group: {
							_id: campaignId,
							total_clicks: {
								$sum: "$clicks",
							},
							total_spends: {
								$sum: "$spends",
							},
							total_ctr: {
								$avg: "$ctr",
							},
						},
					},
					{
						$project: {
							budget_spend: "$total_spends",
							budget_remaining: "$balance",
							total_cpc: {
								$cond: [
									{ $eq: ["$total_clicks", 0] },
									0,
									{
										$divide: [
											"$total_spends",
											"$total_clicks",
										],
									},
								],
							},
							total_ctr: "$total_ctr",
						},
					},
				]).exec();
				if (analyticsData[0] === undefined) {
					analyticsData[0] = {
						budget_spend: 0,
						budget_remaining: 0,
						total_cpc: 0,
						total_ctr: 0,
					};
				}

				newCampaignList.push({ ...object, ...analyticsData[0] });
			}

			const total_records = newCampaignList.length;

			if (columnName) {
				// Sorting
				const columnMap = {
					budget_remaining: "budget_remaining",
					total_ctr: "total_ctr",
					budget_spend: "budget_spend",
					total_cpc: "total_cpc",
					daily_budget: "daily_budget",
					name: "name",
					status: "status",
					created_at: "created_at",
					impression: "impression",
					channel: "channel",
					balance: "balance",
				};

				newCampaignList.sort((a, b) => {
					const propA = a[columnMap[columnName]];
					const propB = b[columnMap[columnName]];
					let result: any;

					if (
						columnName === "name" ||
						columnName === "status" ||
						columnName === "channel"
					) {
						result =
							order === "asc"
								? propA
										.toLowerCase()
										.localeCompare(propB.toLowerCase())
								: propB
										.toLowerCase()
										.localeCompare(propA.toLowerCase());
					} else if (
						columnName === "budget_remaining" ||
						columnName === "total_ctr" ||
						columnName === "budget_spend" ||
						columnName === "total_cpc" ||
						columnName === "daily_budget" ||
						columnName === "created_at" ||
						columnName === "impression" ||
						columnName === "balance"
					) {
						result =
							order === "asc" ? propA - propB : propB - propA;
					}

					return result;
				});
			}

			let campaignList = newCampaignList.slice(
				(page - 1) * limit,
				page * limit
			);
			var response = {
				page,
				limit,
				total_records,
				campaigns: campaignList,
			};

			return response;
		} catch (err) {
			let errorMgs = "Campaign list not found.";
			await errorResonse(errorMgs, err);
		}
	}

	@Query((returns) => CampaignType)
	async campaignDetail(
		@Ctx() { req, parent, _token },
		@Arg("campaign_id", { nullable: false }) campaign_id: string
	) {
		await verifyToken(_token);
		try {
			let campaignDetail = await Campaign.findOne({ _id: campaign_id });
			return campaignDetail;
		} catch (err) {
			let errorMgs = "Campaign details not found.";
			await errorResonse(errorMgs, err);
		}
	}
	@Mutation((returns) => CampaignType)
	async updateCampaign(
		@Ctx() { req, parent, _token },
		@Arg("name", { nullable: false }) name: string,
		@Arg("placement", { nullable: false }) placement: string,
		@Arg("countries", (type) => [GraphQLJSON], { nullable: false })
		countries: [any],
		@Arg("objectives", (type) => [GraphQLJSON], { nullable: false })
		objectives: [string],
		@Arg("interest_categories", (type) => [GraphQLJSON], {
			nullable: false,
		})
		interest_categories: [any],
		@Arg("device_targeting", (type) => [GraphQLJSON], { nullable: false })
		device_targeting: [any],
		@Arg("number_of_impression", { nullable: true })
		number_of_impression: string,
		@Arg("impressions", { nullable: true }) impressions: string,
		@Arg("time_frame", { nullable: true }) time_frame: string,
		@Arg("total_budget", { nullable: true }) total_budget: number,
		@Arg("daily_budget", { nullable: true }) daily_budget: number,
		@Arg("cpm_bid", { nullable: true }) cpm_bid: number,
		@Arg("creative", (type) => [GraphQLJSON], { nullable: false })
		creative: [any],
		@Arg("utm_url", { nullable: false }) utm_url: string,
		@Arg("is_active", { nullable: false }) is_active: boolean,
		@Arg("rejected_reason", { nullable: false }) rejected_reason: string,
		@Arg("commission", { nullable: true }) commission: number,
		@Arg("balance", { nullable: true }) balance: number,
		@Arg("spent", { nullable: true }) spent: number,
		@Arg("_id", { nullable: false }) _id: string
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		let campaignDetail = await Campaign.findOne({ _id: _id });
		return new Promise(async (resolve, reject) => {
			try {
				let country = JSON.parse(JSON.stringify(countries));
				let objective = JSON.parse(JSON.stringify(objectives));
				let interests = JSON.parse(JSON.stringify(interest_categories));
				let device = JSON.parse(JSON.stringify(device_targeting));
				let creatives = JSON.parse(JSON.stringify(creative));
				const mappedPreviousCampaignValues =
					campaignPreviousValuesMapper(campaignDetail);

				// Existing status rejected then change to pending
				const { status, channel, request_type } =
					await Campaign.findOne({ _id: _id });
				let newStatus = status;
				// if campaign is rejected and user edits it
				if (
					status.toLowerCase() ===
					CAMPAIGN_STATUS.REJECTED.toLowerCase()
				) {
					newStatus = CAMPAIGN_STATUS.PENDING;
					// newStatus = CAMPAIGN_STATUS.PENDING_CHANGE
				}
				// if campaign is paused status, Edit would make status PendingChange
				else if (
					status.toLowerCase() ===
					CAMPAIGN_STATUS.PAUSED.toLowerCase()
				) {
					if (
						request_type?.toLowerCase() ===
						CAMPAIGN_STATUS_REQUEST.COPY.toLowerCase()
					) {
						newStatus = CAMPAIGN_STATUS.PENDING;
					} else {
						newStatus = CAMPAIGN_STATUS.PENDING_CHANGE;
					}
				}
				// if campaign is edited again by user before admin approves it
				else if (
					status.toLowerCase() ===
						CAMPAIGN_STATUS.PENDING.toLowerCase() &&
					channel == ""
				) {
					newStatus = CAMPAIGN_STATUS.PENDING;
				}
				// if campaign is active and user edits it
				else if (
					status.toLowerCase() ===
					CAMPAIGN_STATUS.ACTIVE.toLowerCase()
				) {
					newStatus = CAMPAIGN_STATUS.PENDING_CHANGE;
				}
				// when the campaign is in draft status
				else if (
					status.toLowerCase() === CAMPAIGN_STATUS.DRAFT.toLowerCase()
				) {
					newStatus = CAMPAIGN_STATUS.PENDING;
				}

				let CampaignData = await Campaign.findOneAndUpdate(
					{ _id: _id },
					{
						name: name,
						placement: placement,
						countries: country,
						objectives: objective,
						interest_categories: interests,
						device_targeting: device,
						number_of_impression: number_of_impression,
						time_frame: time_frame,
						total_budget: total_budget,
						daily_budget: daily_budget,
						cpm_bid: cpm_bid,
						creative: creatives,
						utm_url: utm_url,
						is_active: is_active,
						rejected_reason: rejected_reason,
						commission: commission,
						balance: balance,
						spent: spent,
						impressions: impressions,
						status: newStatus,
						updated_at: new Date(),
						previous_campaign_values: mappedPreviousCampaignValues,
					},
					{ new: true }
				);

				// Trigger for zapier for update campaign request for further notifications
				sendUpdateCampaignRequestWebhook(CampaignData, userData);

				return resolve(CampaignData);
			} catch (err) {
				console.log(
					"try catch error while add Campaign detail ==>> ",
					err
				);
				reject(err);
			}
		}).catch(async (error) => {
			let errorMgs = "Campaign not updated.";
			await errorResonse(errorMgs, error);
		});
	}
	@Query((returns) => CampaignType)
	async deleteCampaign(
		@Ctx() { req, parent, _token },
		@Arg("delete", { nullable: true }) deleteFlag: boolean,
		@Arg("_id", { nullable: true }) _id: string
	) {
		await verifyToken(_token);
		try {
			let CampaignDetail = await Campaign.findOne({ _id: _id });
			if (deleteFlag) {
				CampaignDetail.is_deleted = deleteFlag;
			}
			const result = await CampaignDetail.save();
			return result;
		} catch (err) {
			let errorMgs = "Campaign not deleted.";
			await errorResonse(errorMgs, err);
		}
	}
	@Query((returns) => CampaignType)
	async copyCampaign(
		@Ctx() { req, parent, _token },
		@Arg("name", { nullable: true }) name: string,
		@Arg("_id", { nullable: true }) _id: string
	) {
		await verifyToken(_token);
		return new Promise(async (resolve, reject) => {
			try {
				let CampaignDetail = await Campaign.findOne({ _id: _id });
				let userData = await User.findOne({
					_id: CampaignDetail.user_id,
				});
				const campaignData = new Campaign({
					name: name,
					user_id: CampaignDetail.user_id,
					placement: CampaignDetail.placement,
					countries: CampaignDetail.countries,
					objectives: CampaignDetail.objectives,
					interest_categories: CampaignDetail.interest_categories,
					device_targeting: CampaignDetail.device_targeting,
					number_of_impression: CampaignDetail.number_of_impression,
					time_frame: CampaignDetail.time_frame,
					status: CAMPAIGN_STATUS.PAUSED,
					request_type: CAMPAIGN_STATUS_REQUEST.COPY,
					impressions: 0,
					total_budget: 0,
					daily_budget: 0,
					cpm_bid: 0,
					creative: CampaignDetail.creative,
					utm_url: CampaignDetail.utm_url,
					is_active: false,
					rejected_reason: CampaignDetail.rejected_reason,
					commission: CampaignDetail.commission,
					balance: 0,
					spent: 0,
				});

				// User balance deducted and add data into transaction
				if (
					CampaignDetail.total_budget &&
					Number.isInteger(CampaignDetail.total_budget)
				) {
					if (
						Number(userData.available_balance) >=
						Number(CampaignDetail.total_budget)
					) {
						let result = await campaignData.save();

						// let userBalance =
						// 	Number(userData.available_balance) -
						// 	Number(CampaignDetail.total_budget);
						// userData.available_balance = userBalance;
						// await userData.save();

						let campaign_response = {
							name: result.name,
							id: result._id,
							amount: result.balance,
							utm_url: result.utm_url,
						};
						const transactionData = await new Transaction({
							user_id: userData._id,
							amount: 0,
							type: "debit",
							transaction_type: "internal",
							payment_response: null,
							checkout_id: null,
							campaign_response: campaign_response,
						});
						await transactionData.save();

						//Add data into analytics table
						const CountriesList = await countryData.countriesList;
						const creative = CampaignDetail.creative;
						const countries = CampaignDetail.countries;
						if (creative.length > 0) {
							for (let createCreative in creative) {
								const creativeData = await Creative.findById(
									creative[createCreative]
								)
									.then((docs) => {
										return docs;
									})
									.catch((err) => {
										console.log(err);
									});
								if (countries.length > 0) {
									for (let country in countries) {
										const index =
											await CountriesList.findIndex(
												(object) => {
													return (
														object.name ===
														countries[country]
													);
												}
											);

										const analyticsData = new Analytic({
											country: CountriesList[index].iso2,
											creative_id:
												creative[createCreative],
											date: new Date(),
											campaign_id: result?._id,
											clicks: 0,
											cpm: 0,
											ctr: 0,
											spends: 0,
											desktopImpressionsPercent: 0,
											impressions: 0,
											mobileImpressionsPercent: 0,
											uniqueImpressions: 0,
											creativeName: creativeData["name"],
											creativeSize: creativeData["size"],
										});
										await analyticsData.save();
									}
								} else {
									const analyticsData = new Analytic({
										country: "",
										creative_id: createCreative,
										date: new Date(),
										campaign_id: result?._id,
										clicks: 0,
										cpm: 0,
										ctr: 0,
										spends: 0,
										desktopImpressionsPercent: 0,
										impressions: 0,
										mobileImpressionsPercent: 0,
										uniqueImpressions: 0,
										creativeName: creativeData["name"],
										creativeSize: creativeData["size"],
									});
									await analyticsData.save();
								}
							}
						}
						return resolve(result);
					} else {
						reject("Insufficient balance in your account.");
					}
				}
			} catch (err) {
				console.log(
					"try catch error while copy Campaign detail ==>> ",
					err
				);
				reject(err);
			}
		}).catch(async (error) => {
			console.log("error when copy Campaign:", error);
			let errorMgs = "Campaign copy failed due to insufficient balance.";
			await errorResonse(errorMgs, error);
		});
	}
	@Mutation((returns) => CampaignType)
	async updateStatusCampaign(
		@Ctx() { req, parent, _token },
		@Arg("_id", { nullable: false }) _id: string,
		@Arg("status", { nullable: false }) status: string,
		@Arg("channel", { nullable: false }) channel: string
	) {
		// await verifyToken(_token);
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		let CampaignData: any = await Campaign.findOne({ _id: _id });
		//Checking existing status
		let existingStatus = CampaignData.status;
		let newStatus = status;
		//Checking existing channel
		let existingChannel = CampaignData.channel;
		let newChannel = channel;

		try {
			// filtering out requests
			switch (newStatus.toLowerCase()) {
				// Cases containing approved status and new Channel as Manual
				case CAMPAIGN_STATUS.APPROVED.toLowerCase():
					// Condition to setup new campaign in Manual by Admin
					if (
						existingStatus.toLowerCase() ==
							CAMPAIGN_STATUS.PENDING.toLowerCase() &&
						newChannel == CAMPAIGN_CHANNEL.MANUAL
					) {
						CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
						CampaignData.is_active = true;
						CampaignData.channel = newChannel;
						CampaignData.request_type = "";
						await CampaignData.save();
						sendCampaignApprovedWebhook(CampaignData, userData);
					}
					// Condition to setup new Channel in Manual and code pauses the campaign Active in GAM
					else if (
						existingStatus.toLowerCase() ==
							CAMPAIGN_STATUS.PENDING_CHANGE.toLowerCase() &&
						existingChannel == CAMPAIGN_CHANNEL.GAM &&
						newChannel == CAMPAIGN_CHANNEL.MANUAL
					) {
						await CampaignActions({
							actionType: "pause",
							lineItemId: CampaignData?.gam?.lineItemId,
						});
						CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
						CampaignData.is_active = true;
						CampaignData.channel = newChannel;
						CampaignData.request_type = "";
						await CampaignData.save();
						sendCampaignApprovedWebhook(CampaignData, userData);
					}
					// Condition to update the campaign in Manual
					else if (
						existingStatus.toLowerCase() ==
							CAMPAIGN_STATUS.PENDING_CHANGE.toLowerCase() &&
						existingChannel == CAMPAIGN_CHANNEL.MANUAL &&
						newChannel == CAMPAIGN_CHANNEL.MANUAL
					) {
						if (
							CampaignData?.request_type?.toLowerCase() ==
							CAMPAIGN_STATUS_REQUEST.PAUSE.toLowerCase()
						) {
							CampaignData.status = CAMPAIGN_STATUS.PAUSED;
							CampaignData.is_active = false;
							CampaignData.channel = newChannel;
							CampaignData.request_type = "";
							sendCampaignPausedWebhook(CampaignData, userData);
						} else if (
							CampaignData?.request_type?.toLowerCase() ==
							CAMPAIGN_STATUS_REQUEST.RESUME.toLowerCase()
						) {
							CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
							CampaignData.is_active = true;
							CampaignData.channel = newChannel;
							CampaignData.request_type = "";
							sendCampaignResumedWebhook(CampaignData, userData);
						}
						// maybe condition of balance add , also if new campaign is approved to Manual when copied from a exiting campaign
						else {
							CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
							CampaignData.is_active = true;
							CampaignData.channel = newChannel;
							CampaignData.request_type = "";
							sendCampaignApprovedWebhook(CampaignData, userData);
						}
						await CampaignData.save();
					}
					// condition if campaign is changed before the admin approves it
					else if (
						existingStatus.toLowerCase() ==
							CAMPAIGN_STATUS.PENDING_CHANGE.toLowerCase() &&
						(existingChannel == "" || existingChannel == undefined)
					) {
						CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
						CampaignData.is_active = true;
						CampaignData.channel = newChannel;
						CampaignData.request_type = "";
						await CampaignData.save();
						sendCampaignApprovedWebhook(CampaignData, userData);
					}
					break;
				// all the rejected cases, GAM / Manual / Pending / Pending Change
				case CAMPAIGN_STATUS.REJECTED.toLowerCase():
					if (existingChannel == CAMPAIGN_CHANNEL.GAM) {
						await CampaignActions({
							actionType: "pause",
							lineItemId: CampaignData?.gam?.lineItemId,
						});
					}
					CampaignData.status = CAMPAIGN_STATUS.REJECTED;
					CampaignData.is_active = false;
					CampaignData.channel = existingChannel || "";
					CampaignData.request_type = "";
					await CampaignData.save();
					sendCampaignRejectedWebhook(CampaignData, userData);
					break;
				default:
					break;
			}

			return CampaignData;
		} catch (error: any) {
			let errorMgs = "Campaign status not updated.";
			if (error == "insufficient balance in your account.") {
				errorMgs = error;
			}
			await errorResonse(errorMgs, error);
		}
	}
	@Mutation((returns) => CampaignType)
	async updateStatusCampaignUser(
		@Ctx() { req, parent, _token },
		@Arg("_id", { nullable: false }) _id: string,
		@Arg("status", { nullable: false }) status: string,
		@Arg("channel", { nullable: false }) channel: string
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		// Find campaign data using the given campaign ID
		let CampaignData: any = await Campaign.findOne({ _id: _id });
		// If the user associated with the campaign is not the same user who is updating the status, throw an error
		if (userData._id.toString() !== CampaignData.user_id) {
			throw new Error("You are not authorized to update this campaign.");
		}

		// evaluating current channel
		// let existingStatus = CampaignData.status
		const newStatus = status;
		const existingChannel = CampaignData.channel;
		try {
			switch (newStatus.toLowerCase()) {
				// condition to resume the campaign
				case CAMPAIGN_STATUS_REQUEST.ACTIVE.toLowerCase():
					// condition to resume campaign in gam
					if (existingChannel === CAMPAIGN_CHANNEL.GAM) {
						// check if user has more than 20 dollars in his campaign before continuing!
						if (CampaignData.balance < 20) {
							throw new Error(
								"Insufficient campaign balance. Minimum $20 required"
							);
						}

						await CampaignActions({
							actionType: "resume",
							lineItemId: CampaignData?.gam?.lineItemId,
						});
						CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
						CampaignData.is_active = true;
						await CampaignData.save();
						sendCampaignResumedWebhook(CampaignData, userData);
					}
					// condition to resume campaign in Manual
					else if (existingChannel === CAMPAIGN_CHANNEL.MANUAL) {
						CampaignData.status = CAMPAIGN_STATUS.PENDING_CHANGE;
						CampaignData.request_type =
							CAMPAIGN_STATUS_REQUEST.RESUME;
						await CampaignData.save();
						sendManualChannelUpdateRequestWebhook(
							CampaignData,
							userData
						);
					}
					break;
				case CAMPAIGN_STATUS_REQUEST.PAUSE.toLowerCase():
					// condition to pause campaign in gam
					if (existingChannel === CAMPAIGN_CHANNEL.GAM) {
						await CampaignActions({
							actionType: "pause",
							lineItemId: CampaignData?.gam?.lineItemId,
						});
						CampaignData.status = CAMPAIGN_STATUS.PAUSED;
						CampaignData.is_active = false;
						await CampaignData.save();
						sendCampaignPausedWebhook(CampaignData, userData);
					}
					// condition to request pause campagin in Manual
					else if (existingChannel == CAMPAIGN_CHANNEL.MANUAL) {
						CampaignData.status = CAMPAIGN_STATUS.PENDING_CHANGE;
						CampaignData.request_type =
							CAMPAIGN_STATUS_REQUEST.PAUSE;
						await CampaignData.save();
						sendManualChannelUpdateRequestWebhook(
							CampaignData,
							userData
						);
					}
					break;
				default:
					break;
			}

			return CampaignData;
		} catch (error: any) {
			let errMsg = error?.response?.data?.error?.message || error.message;
			console.log(
				error?.response?.data?.error?.message,
				error.message || error.message
			);
			await errorResonse(errMsg, error);
		}
	}

	@Mutation((returns) => CampaignType)
	async updateCommissionCampaign(
		@Ctx() { req, parent, _token },
		@Arg("_id", { nullable: false }) _id: string,
		@Arg("commission", { nullable: false }) commission: number
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		let CampaignData = await Campaign.findOne({ _id: _id });
		return new Promise(async (resolve, reject) => {
			try {
				if (commission) {
					CampaignData.commission = commission;
				}
				const result = CampaignData.save();
				return resolve(CampaignData);
			} catch (err) {
				reject(err);
			}
		}).catch(async (error) => {
			let errorMgs = "Commission not updated.";
			await errorResonse(errorMgs, error);
		});
	}
	@Mutation((returns) => CustomResponseType)
	async transferBalance(
		@Ctx() { req, parent, _token },
		@Arg("camp_id", { nullable: false }) camp_id: string,
		@Arg("type", { nullable: false }) type: string,
		@Arg("balance", { nullable: false }) balance: Number
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		let CampaignData = await Campaign.findOne({ _id: camp_id });
		return new Promise(async (resolve, reject) => {
			try {
				if (type == "debit") {
					if (balance && Number.isInteger(balance)) {
						if (CampaignData.status == CAMPAIGN_STATUS.PAUSED) {
							if (
								Number(userData.available_balance) >=
								Number(balance)
							) {
								let userBalance =
									Number(userData.available_balance) -
									Number(balance);
								let campaignBalance =
									Number(CampaignData.balance) +
									Number(balance);
								let totalBudget =
									Number(CampaignData.total_budget) +
									Number(balance);
								userData.available_balance = userBalance;
								CampaignData.balance = campaignBalance;
								CampaignData.total_budget = totalBudget;
								await userData.save();
								let campaign_response = {
									name: CampaignData.name,
									id: CampaignData._id,
									status: CampaignData.status,
									amount: campaignBalance,
									utm_url: CampaignData.utm_url,
								};
								const transactionData = await new Transaction({
									user_id: userData._id,
									amount: balance,
									type: type,
									transaction_type: "internal",
									payment_response: null,
									checkout_id: null,
									campaign_response: campaign_response,
								});
								await transactionData.save();
							} else {
								reject("Insufficient balance in your account.");
							}
						} else {
							reject("Campaign status not Pause.");
						}
					} else {
						reject("Balance amount not valid.");
					}
					const result = await CampaignData.save();
				}
				if (type == "credit") {
					if (
						balance &&
						Number.isInteger(balance) &&
						CampaignData.status == CAMPAIGN_STATUS.PAUSED
					) {
						if (Number(CampaignData.balance) >= Number(balance)) {
							let userBalance =
								Number(userData.available_balance) +
								Number(balance);
							let campaignBalance =
								Number(CampaignData.balance) - Number(balance);
							let totalBudget =
								Number(CampaignData.total_budget) -
								Number(balance);

							// console.log("userBalance ", userBalance);
							userData.available_balance = userBalance;
							CampaignData.balance = campaignBalance;
							CampaignData.total_budget = totalBudget;
							await userData.save();
							let campaign_response = {
								name: CampaignData.name,
								id: CampaignData._id,
								status: CampaignData.status,
								amount: campaignBalance,
								utm_url: CampaignData.utm_url,
							};
							const transactionData = await new Transaction({
								user_id: userData._id,
								amount: balance,
								type: type,
								transaction_type: "internal",
								payment_response: null,
								checkout_id: null,
								campaign_response: campaign_response,
							});
							await transactionData.save();
						} else {
							reject("Insufficient balance in your account.");
						}
					} else {
						reject(true);
					}
					const result = await CampaignData.save();
				}
				let response = {
					message: `user balance ${type}`,
					status: 200,
					data: null,
				};
				return resolve(response);
			} catch (err) {
				reject(err);
			}
		}).catch(async (error) => {
			console.log("error ", error);
			let errorMgs = "Balance Transfer not Success-full.";
			if (error == "Insufficient balance in your account.") {
				errorMgs = error;
			}
			await errorResonse(errorMgs, error);
		});
	}

	@Query((returns) => CampaignListType)
	async userCampaignLogs(
		@Ctx() { req, parent, _token },
		@Arg("limit", { nullable: false }) limit: number,
		@Arg("page", { nullable: false }) page: number,
		@Arg("columnName", { nullable: true }) columnName: string,
		@Arg("order", { nullable: true }) order: string,
		@Arg("search", { nullable: true }) search: string,
		@Arg("objective", () => [String], { nullable: true })
		objective: string[],
		@Arg("budget", { nullable: true }) budget: boolean,
		@Arg("startDate", { nullable: true }) startDate: string,
		@Arg("endDate", { nullable: true }) endDate: string
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });

		//Search
		let searchValue = search ? search : "";
		let regex = new RegExp(searchValue, "i");
		const conditionArr = [];
		conditionArr.push({ is_deleted: false });
		if (searchValue) {
			conditionArr.push({
				$or: [{ name: regex }, { user_id: regex }],
			});
		}
		if (objective && objective.length) {
			conditionArr.push({ objectives: { $in: objective } });
		}
		if (budget) {
			conditionArr.push({ total_budget: { $lt: 500 } });
		}
		if (startDate && endDate) {
			conditionArr.push({
				created_at: {
					$gte: new Date(startDate + " 00:00:00"),
					$lte: new Date(endDate + " 23:59:59"),
				},
			});
		}

		//Sorting
		const orderType = order && order == "desc" ? -1 : 1;

		let CampaignsData = [];
		return new Promise(async (resolve, reject) => {
			try {
				//Auth user campaigns where status = Approved
				if (conditionArr.length > 0) {
					CampaignsData = await Campaign.aggregate(
						[
							{
								$match: {
									user_id: userData._id.toHexString(),
									$and: conditionArr,
									status: "Approved",
								},
							},
							{
								$addFields: {
									user_id: { $toObjectId: "$user_id" },
								},
							},
							{
								$lookup: {
									from: "users",
									localField: "user_id",
									foreignField: "_id",
									as: "userdetails",
								},
							},
							{
								$sort: { [columnName]: orderType },
							},
						],
						function (err, response) {
							if (err) throw err;
							return response;
						}
					);
				} else {
					CampaignsData = await Campaign.aggregate(
						[
							{
								$match: {
									user_id: userData._id.toHexString(),
									status: "Approved",
								},
							},
							{
								$addFields: {
									user_id: { $toObjectId: "$user_id" },
								},
							},
							{
								$lookup: {
									from: "users",
									localField: "user_id",
									foreignField: "_id",
									as: "userdetails",
								},
							},
							{
								$sort: { [columnName]: orderType },
							},
						],
						function (err, response) {
							if (err) throw err;
							return response;
						}
					);
				}

				const total_records = CampaignsData.length;
				let campaignList = CampaignsData.slice(
					(page - 1) * limit,
					page * limit
				);

				var response = {
					page,
					limit,
					total_records,
					campaigns: campaignList,
				};
				return resolve(response);
			} catch (err) {
				reject(err);
			}
		}).catch(async (error) => {
			console.log("error ", error);
			let errorMgs = "Error while fetch auth user campaigns.";
			await errorResonse(errorMgs, error);
		});
	}

	@Mutation((returns) => CampaignType)
	async createCampaignInGAM(
		@Ctx() { req, parent, _token },
		@Arg("_id", { nullable: false }) campaign_id: string,
		@Arg("status", { nullable: true }) status: string
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		let CampaignData: any = await Campaign.findOne({ _id: campaign_id });

		let existingChannel = CampaignData.channel;
		let existingStatus = CampaignData.status;
		try {
			// checking current Status
			switch (existingStatus.toLowerCase()) {
				// This condition is for creating a new campaignInGam
				case CAMPAIGN_STATUS.PENDING.toLowerCase():
					const response: any = await createCampaignInGAM(
						campaign_id
					);
					if (response.success) {
						let CampaignDataUpdated: any = await Campaign.findOne({
							_id: campaign_id,
						});
						await CampaignActions({
							actionType: "resume",
							lineItemId: CampaignDataUpdated?.gam?.lineItemId,
						});
						CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
						CampaignData.is_active = true;
						CampaignData.channel = CAMPAIGN_CHANNEL.GAM;
						CampaignData.request_type = "";

						await CampaignData.save();
						sendCampaignApprovedWebhook(CampaignData, userData);
					}

					return CampaignData;
				// break;
				case CAMPAIGN_STATUS.PENDING_CHANGE.toLowerCase():
					// This condition is for updating campaign in GAM
					if (existingChannel == CAMPAIGN_CHANNEL.GAM) {
						// pausing line Item before making any changes to it
						await CampaignActions({
							actionType: "pause",
							lineItemId: CampaignData?.gam?.lineItemId,
						});

						// updating status in current db
						CampaignData.status = CAMPAIGN_STATUS.PAUSED;
						CampaignData.is_active = false;
						CampaignData.request_type = "";
						await CampaignData.save();

						// updating campaign in GAM
						const response: any = await updateCampaignInGAM(
							campaign_id
						);

						// after updating changing back the status and is_active value
						if (response.success) {
							// only resume line item when updating Campaign In Gam is successful
							await CampaignActions({
								actionType: "resume",
								lineItemId: CampaignData?.gam?.lineItemId,
							});
							CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
							CampaignData.is_active = true;
							CampaignData.channel = CAMPAIGN_CHANNEL.GAM;
							CampaignData.request_type = "";

							await CampaignData.save();
							sendCampaignApprovedWebhook(CampaignData, userData);
						}
						return CampaignData;
					}
					// This condition is to setup new campaign in GAM, and admin manually stops campaign in Manual
					else if (existingChannel == CAMPAIGN_CHANNEL.MANUAL) {
						const response: any = await createCampaignInGAM(
							campaign_id
						);
						if (response.success) {
							CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
							CampaignData.is_active = true;
							CampaignData.channel = CAMPAIGN_CHANNEL.GAM;
							CampaignData.request_type = "";

							await CampaignData.save();
							sendCampaignApprovedWebhook(CampaignData, userData);
						}
						return CampaignData;
					}
					// when updating a campaign before admin approves it, might not be required
					else if (existingChannel == "") {
						const response: any = await createCampaignInGAM(
							campaign_id
						);
						if (response.success) {
							CampaignData.status = CAMPAIGN_STATUS.ACTIVE;
							CampaignData.is_active = true;
							CampaignData.channel = CAMPAIGN_CHANNEL.GAM;
							CampaignData.request_type = "";

							await CampaignData.save();
							sendCampaignApprovedWebhook(CampaignData, userData);
						}

						return CampaignData;
					}
					break;
				default:
					throw Error(
						"Operation not supported for current campaign Status"
					);
			}
		} catch (error: any) {
			// let errMsg = "Unable to setup campaign in GAM"
			let errMsg =
				error?.response?.data ||
				error?.message ||
				"Unable to setup campaign in GAM";
			await errorResonse(errMsg, error);
		}
	}

	@Mutation((returns) => CampaignType)
	async draftCampaign(
		@Ctx() { req, parent, _token },
		@Arg("name", { nullable: true }) name: string,
		@Arg("placement", { nullable: true }) placement: string,
		@Arg("countries", (type) => [GraphQLJSON], { nullable: true })
		countries: [any],
		@Arg("objectives", (type) => [GraphQLJSON], { nullable: true })
		objectives: [string],
		@Arg("interest_categories", (type) => [GraphQLJSON], {
			nullable: true,
		})
		interest_categories: [any],
		@Arg("device_targeting", (type) => [GraphQLJSON], { nullable: true })
		device_targeting: [any],
		@Arg("number_of_impression", { nullable: true })
		number_of_impression: string,
		@Arg("impressions", { nullable: true }) impressions: string,
		@Arg("time_frame", { nullable: true }) time_frame: string,
		@Arg("total_budget", { nullable: true }) total_budget: number,
		@Arg("daily_budget", { nullable: true }) daily_budget: number,
		@Arg("cpm_bid", { nullable: true }) cpm_bid: number,
		@Arg("creative", (type) => [GraphQLJSON], { nullable: true })
		creative: [any],
		@Arg("utm_url", { nullable: true }) utm_url: string,
		@Arg("is_active", { nullable: true }) is_active: boolean,
		@Arg("rejected_reason", { nullable: true }) rejected_reason: string,
		@Arg("commission", { nullable: true }) commission: number,
		@Arg("balance", { nullable: true }) balance: number,
		@Arg("spent", { nullable: true }) spent: number,
		@Arg("_id", { nullable: true }) _id: string
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		// let campaignDetail = await Campaign.findOne({ _id: _id })
		return new Promise(async (resolve, reject) => {
			try {
				let country = JSON.parse(JSON.stringify(countries));
				let objective = JSON.parse(JSON.stringify(objectives));
				let interests = JSON.parse(JSON.stringify(interest_categories));
				let device = JSON.parse(JSON.stringify(device_targeting));
				let creatives = JSON.parse(JSON.stringify(creative));

				let CampaignData: any;
				const isCampaignExist = await Campaign.findById(_id);

				if (!isCampaignExist) {
					CampaignData = await new Campaign({
						name: name,
						user_id: userData._id,
						placement: placement,
						countries: country,
						objectives: objective,
						interest_categories: interests,
						device_targeting: device,
						number_of_impression: number_of_impression,
						time_frame: time_frame,
						total_budget: total_budget,
						daily_budget: daily_budget,
						cpm_bid: cpm_bid,
						creative: creatives,
						utm_url: utm_url,
						is_active: is_active,
						rejected_reason: rejected_reason,
						commission: commission,
						balance: balance,
						spent: spent,
						impressions: impressions,
						status: CAMPAIGN_STATUS.DRAFT,
						updated_at: new Date(),
					});
					await CampaignData.save();
				} else {
					CampaignData = await Campaign.findOneAndUpdate(
						{ _id: _id },
						{
							name: name,
							user_id: userData._id,
							placement: placement,
							countries: country,
							objectives: objective,
							interest_categories: interests,
							device_targeting: device,
							number_of_impression: number_of_impression,
							time_frame: time_frame,
							total_budget: total_budget,
							daily_budget: daily_budget,
							cpm_bid: cpm_bid,
							creative: creatives,
							utm_url: utm_url,
							is_active: is_active,
							rejected_reason: "rejected_reason",
							commission: 30,
							balance: balance,
							spent: 0,
							impressions: 0,
							status: CAMPAIGN_STATUS.DRAFT,
							updated_at: new Date(),
						},
						{ new: true }
					);
				}

				return resolve(CampaignData);
			} catch (err) {
				console.log(
					"try catch error while drafting Campaign detail ==>> ",
					err
				);
				reject(err);
			}
		}).catch(async (error) => {
			let errorMgs = "Campaign not updated.";
			await errorResonse(errorMgs, error);
		});
	}
}

const clearAllDrafts = async () => {
	try {
		await Campaign.deleteMany({ status: CAMPAIGN_STATUS.DRAFT });
	} catch (error) {
		console.log("error while clearing drafts", error);
	}
};
