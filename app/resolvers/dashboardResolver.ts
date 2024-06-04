import { Resolver, Ctx, Query } from "type-graphql";
import {
	AdminDetailsCountType,
	MonthYearType,
	UserDashboardAverageCountType,
} from "../type/index";
import { Analytic, Campaign, Transaction, User } from "../schema/index";
import { verifyToken, errorResonse } from "../helper";
import { reverse } from "dns";
@Resolver()
export class DashboardResolver {
	async calculatePercentageGrowth(currentValue, previousValue) {
		let percentageGrowth = 100;
		if (previousValue === 0 && currentValue === 0) {
			percentageGrowth = 0;
		} else if (previousValue !== 0) {
			percentageGrowth =
				((currentValue - previousValue) / previousValue) * 100;
		}
		return percentageGrowth;
	}

	@Query((returns) => AdminDetailsCountType)
	async adminDashboardCounts(@Ctx() { req, parent, _token }) {
		await verifyToken(_token);
		try {
			const currentMonth = new Date().getMonth() + 1; // Get current month (1-12)
			const prevMonth = currentMonth - 1 < 1 ? 12 : currentMonth - 1; // Get previous month (1-12)

			//Get balance based on credit & debit amount
			const transactions = await Transaction.aggregate([
				{
					$lookup: {
						from: "users",
						localField: "user_id",
						foreignField: "_id",
						as: "user",
					},
				},
				{
					$match: {
						"user.is_deleted": { $ne: true },
					},
				},
				{
					$match: {
						$and: [
							{
								$or: [
									{
										type: "credit",
										checkout_id: { $ne: null },
									},
									{ type: "debit", checkout_id: null },
								],
							},
						],
					},
				},
				{
					$group: {
						_id: "$type",
						totalAmount: { $sum: "$amount" },
					},
				},
			]);

			const totalBalance = await User.aggregate([
				{
					$match: {
						user_type: "customer",
					},
				},
				{
					$group: {
						_id: "$user_type",
						balance: { $sum: "$available_balance" },
					},
				},
			]);

			const debitAmount =
				transactions.find((t) => t._id === "debit")?.totalAmount ?? 0;
			const creditAmount =
				transactions.find((t) => t._id === "credit")?.totalAmount ?? 0;
			const balance = (creditAmount - debitAmount).toFixed(2);

			//Get balance percentage based on previous & next month
			const currentMonthResults = await Transaction.aggregate([
				{
					$match: {
						type: { $in: ["credit", "debit"] },
						$expr: {
							$eq: [{ $month: "$created_at" }, currentMonth],
						},
					},
				},
				{
					$group: {
						_id: "$type",
						amount: { $sum: "$amount" },
					},
				},
			]);
			const currentMonthDebits =
				currentMonthResults.find((item) => item._id === "debit")
					?.amount || 0;
			const currentMonthCredits =
				currentMonthResults.find((item) => item._id === "credit")
					?.amount || 0;
			let currentMonthBalance = currentMonthCredits - currentMonthDebits;

			const previousMonthResults = await Transaction.aggregate([
				{
					$match: {
						type: { $in: ["credit", "debit"] },
						$expr: {
							$eq: [{ $month: "$created_at" }, prevMonth],
						},
					},
				},
				{
					$group: {
						_id: "$type",
						amount: { $sum: "$amount" },
					},
				},
			]);
			const prevMonthDebits =
				previousMonthResults.find((item) => item._id === "debit")
					?.amount || 0;
			const prevMonthCredits =
				previousMonthResults.find((item) => item._id === "credit")
					?.amount || 0;
			let prevMonthBalance = prevMonthCredits - prevMonthDebits;

			const balancePercentage = await this.calculatePercentageGrowth(
				currentMonthBalance,
				prevMonthBalance
			);

			//Get credit percentage based on previous & next month
			const percentageCredit = await this.calculatePercentageGrowth(
				currentMonthCredits,
				prevMonthCredits
			);

			// Get campaigns
			const totalCampaign = (
				await Campaign.find().where({
					is_deleted: false,
				})
			).length;

			//Get campaign percentage based on previous & next month
			const currentMonthCampaigns = (
				await Campaign.aggregate([
					{
						$match: {
							is_deleted: false,
							$expr: {
								$eq: [{ $month: "$created_at" }, currentMonth],
							},
						},
					},
				])
			).length;
			const previousMonthCampaigns = (
				await Campaign.aggregate([
					{
						$match: {
							is_deleted: false,
							$expr: {
								$eq: [{ $month: "$created_at" }, prevMonth],
							},
						},
					},
				])
			).length;

			const percentageCampaignGrowth =
				await this.calculatePercentageGrowth(
					currentMonthCampaigns,
					previousMonthCampaigns
				);

			//Get users
			const totalUser = (await User.find()).length;
			//Get user percentage based on previous & next month
			const currentMonthUsers = (
				await User.aggregate([
					{
						$match: {
							$expr: {
								$eq: [{ $month: "$created_at" }, currentMonth],
							},
						},
					},
				])
			).length;
			const previousMonthUsers = (
				await User.aggregate([
					{
						$match: {
							$expr: {
								$eq: [{ $month: "$created_at" }, prevMonth],
							},
						},
					},
				])
			).length;

			const percentageUserGrowth = await this.calculatePercentageGrowth(
				currentMonthUsers,
				previousMonthUsers
			);

			let adminDashboardCount = {};
			adminDashboardCount["balance"] = totalBalance[0]?.balance;
			adminDashboardCount["balance_percentage"] =
				balancePercentage.toFixed(2);
			adminDashboardCount["total_campaign"] = totalCampaign;
			adminDashboardCount["total_campaign_percentage"] =
				percentageCampaignGrowth.toFixed(2);
			adminDashboardCount["credit_added"] = creditAmount.toFixed(2);
			adminDashboardCount["credit_added_percentage"] =
				percentageCredit.toFixed(2);
			adminDashboardCount["total_accounts"] = totalUser;
			adminDashboardCount["total_accounts_percentage"] =
				percentageUserGrowth.toFixed(2);

			return adminDashboardCount;
		} catch (err) {
			let errorMgs = "Admin dashboard details not found.";
			await errorResonse(errorMgs, err);
		}
	}

	@Query((returns) => [MonthYearType])
	async campaignCreated(@Ctx() { req, parent, _token }) {
		await verifyToken(_token);
		let campaignData = [];
		return new Promise(async (resolve, reject) => {
			try {
				campaignData = await Campaign.where({
					is_deleted: false,
				});

				const result = [];
				const years = {};
				campaignData.forEach((campaign) => {
					const year = new Date(campaign.created_at).getFullYear();
					const month = new Date(campaign.created_at).getMonth();
					years[year] = years[year] || Array(12).fill(0);
					years[year][month]++;
				});

				for (const [year, month] of Object.entries(years)) {
					result.push({
						name: year,
						data: month,
					});
				}

				var response = {
					data: result,
				};
				return resolve(result);
			} catch (err) {
				reject(err);
			}
		}).catch(async (error) => {
			let errorMgs = "Error while fetch campaigns created count.";
			await errorResonse(errorMgs, error);
		});
	}

	@Query((returns) => UserDashboardAverageCountType)
	async userDashboardAverageCounts(@Ctx() { req, parent, _token }) {
		var userDetails = await verifyToken(_token);

		try {
			let userData = await User.findOne({ fuid: userDetails.uid });
			const userId = userData?._id.toString();
			const campaignIds = await Campaign.find(
				{ user_id: userId, is_deleted: false },
				{ _id: 1 }
			);
			let campaignIdArr = [];
			for (let index = 0; index < campaignIds.length; index++) {
				const element = campaignIds[index]._id;
				campaignIdArr.push(element.toString());
			}
			const startDate = new Date();
			const endDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

			const [result] = await Analytic.aggregate([
				{
					$facet: {
						lifetimeData: [
							{
								$match: {
									campaign_id: {
										$in: campaignIdArr,
									},
								},
							},
							{
								$group: {
									_id: null,
									lifeTimeImpressions: {
										$sum: "$impressions",
									},
									lifeTimeClicks: { $sum: "$clicks" },
									lifeTimeSpends: { $sum: "$spends" },
									// lifeTimeCtr: { $sum: "$ctr" },
								},
							},
							{
								$project: {
									lifeTimeClicks: 1,
									lifeTimeSpends: 1,
									lifeTimeCtr: {
										$cond: [
											{
												$eq: [
													"$lifeTimeImpressions",
													0,
												],
											},
											0,
											{
												$multiply: [
													{
														$divide: [
															"$lifeTimeClicks",
															"$lifeTimeImpressions",
														],
													},
													100,
												],
											},
										],
									},
								},
							},
						],
						lastmonthData: [
							{
								$match: {
									date: {
										$gte: endDate,
										$lte: startDate,
									},
									campaign_id: {
										$in: campaignIdArr,
									},
								},
							},
							{
								$group: {
									_id: null,
									lastMonthImpressions: {
										$sum: "$impressions",
									},
									lastMonthClicks: { $sum: "$clicks" },
									lastMonthSpends: { $sum: "$spends" },
									// lastMonthCtr: { $sum: "$ctr" },
								},
							},
							{
								$project: {
									lastMonthClicks: 1,
									lastMonthSpends: 1,
									lastMonthCtr: {
										$cond: [
											{
												$eq: [
													"$lastMonthImpressions",
													0,
												],
											},
											0,
											{
												$multiply: [
													{
														$divide: [
															"$lastMonthClicks",
															"$lastMonthImpressions",
														],
													},
													100,
												],
											},
										],
									},
								},
							},
						],
						clicksTime: [
							{
								$match: {
									date: {
										$gte: endDate,
										$lte: startDate,
									},
									campaign_id: {
										$in: campaignIdArr,
									},
								},
							},
							{
								$group: {
									_id: {
										$dateToString: {
											format: "%Y-%m-%d",
											date: "$date",
										},
									},
									clicks: { $sum: "$clicks" },
								},
							},
							{
								$project: {
									_id: 0,
									date: "$_id",
									clicks: 1,
								},
							},
						],
					},
				},
			]);

			const {
				lastMonthClicks = 0,
				lastMonthSpends = 0,
				lastMonthCtr = 0,
			} = result.lastmonthData[0] || {};
			const lastMonthAverageCtr = lastMonthCtr;
			const lastMonthAverageCpc = lastMonthClicks
				? lastMonthSpends / lastMonthClicks
				: 0;

			const {
				lifeTimeClicks = 0,
				lifeTimeSpends = 0,
				lifeTimeCtr = 0,
			} = result.lifetimeData[0] || {};

			const lifeTimeAverageCtr = lifeTimeCtr;

			const newClicks = lifeTimeClicks - lastMonthClicks;
			const newSpends = lifeTimeSpends - lastMonthSpends;
			const newAverageCtr = lifeTimeAverageCtr - lastMonthAverageCtr;
			const newAverageCpc =
				newSpends !== 0 && newClicks !== 0 ? newSpends / newClicks : 0;

			const percentageClicks = await this.calculatePercentageGrowth(
				lastMonthClicks,
				newClicks
			);

			const percentageAverageCpc = await this.calculatePercentageGrowth(
				lastMonthAverageCpc,
				newAverageCpc
			);
			const percentageCtr = await this.calculatePercentageGrowth(
				lastMonthAverageCtr,
				newAverageCtr
			);

			// Step 1: Generate an array of all dates between startdate and enddate
			let datesArray = [];
			for (let d = startDate; d >= endDate; d.setDate(d.getDate() - 1)) {
				datesArray.push({ date: d.toISOString().substring(0, 10) });
			}
			datesArray = datesArray.reverse();

			// Step 2: Retrieve clicks data for each date
			const clicksByDate = result.clicksTime.reduce((acc, val) => {
				acc[val.date] = val.clicks;
				return acc;
			}, {});

			// Step 3: Map the dates array to include clicks data || 0
			const clicksArray = datesArray.map((date) => ({
				...date,
				clicks: clicksByDate[date.date] || 0,
			}));

			const userDashboardAverageCounts = {
				total_clicks: lastMonthClicks,
				total_clicks_percentage: percentageClicks.toFixed(2),
				average_cpc: lastMonthAverageCpc.toFixed(2),
				average_cpc_percentage: percentageAverageCpc.toFixed(2),
				average_ctr: lastMonthAverageCtr.toFixed(2),
				average_ctr_percentage: percentageCtr.toFixed(2),
				click_time: clicksArray,
			};

			return userDashboardAverageCounts;
		} catch (err) {
			let errorMgs = "User dashboard average count details not found.";
			await errorResonse(errorMgs, err);
		}
	}
}
