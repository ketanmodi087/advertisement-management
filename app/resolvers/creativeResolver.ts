import { Resolver, Query, Arg, Mutation, Ctx } from "type-graphql";
import { CreativeType, CreativeListType } from "../type/index";
import { Campaign, Creative, User } from "../schema/index";
const http = require("https");
import * as path from "path";
import { USER_TYPE } from "../constant/enum";
import { verifyToken, errorResonse } from "../helper";
const fs = require("fs");
const admin = require("firebase-admin");
const unzipper = require("unzipper");

@Resolver()
export class CreativeResolver {
	@Mutation((returns) => CreativeType)
	async addCreative(
		@Ctx() { req, parent, _token },
		@Arg("name", { nullable: false }) name: string,
		@Arg("url", { nullable: false }) url: string,
		@Arg("creative_type", { nullable: false }) creativeType: string,
		@Arg("user_id", { nullable: false }) userId: string,
		@Arg("size", { nullable: false }) size: string
	) {
		await verifyToken(_token);
		return new Promise(async (resolve, reject) => {
			try {
				const creativeData = new Creative({
					name: name,
					size: size,
					url: url,
					creative_type: creativeType,
					user_id: userId,
					preview_url: "",
				});

				let result = await creativeData.save();
				return resolve(result);
			} catch (err) {
				console.log(
					"try catch error while add creative detail ==>> ",
					err
				);
				reject(err);
			}
		}).catch(async (error) => {
			let errorMgs = "New creative not added.";
			await errorResonse(errorMgs, error);
		});
	}

	@Query((returns) => CreativeListType)
	async creativeList(
		@Ctx() { req, parent, _token },
		@Arg("limit", { nullable: false }) limit: number,
		@Arg("page", { nullable: false }) page: number,
		@Arg("campaignId", { nullable: true }) campaignId: string,
		@Arg("userId", { nullable: true }) userId: string
	) {
		let fUserDetails = await verifyToken(_token);
		let userData = await User.findOne({ fuid: fUserDetails.uid });
		try {
			const condition = {
				is_deleted: false,
			};
			let Creatives: any;
			if (userId) {
				Creatives = await Creative.find({
					...condition,
					user_id: userId,
				}).sort({ created_at: "desc" });
				// .skip((page - 1) * limit)
				// .limit(limit);
			} else if (campaignId) {
				let campaignData = await Campaign.findOne({
					_id: campaignId,
				});
				if (campaignData?.creative.length < 0) {
					return {
						page,
						limit,
						total_records: 0,
						creatives: [],
					};
				}

				Creatives = await Creative.find({
					_id: { $in: campaignData?.creative },
				}).sort({ created_at: "desc" });
				// .skip((page - 1) * limit)
				// .limit(limit);
			} else {
				if (
					userData?.user_type == USER_TYPE.ADMIN ||
					userData?.user_type == USER_TYPE.SUPER_ADMIN
				) {
					Creatives = await Creative.find({ ...condition }).sort({
						created_at: "desc",
					});
					// .skip((page - 1) * limit)
					// .limit(limit);
				} else {
					Creatives = await Creative.find({
						...condition,
						user_id: userData?._id,
					}).sort({ created_at: "desc" });
				}
			}
			const total_records = Creatives.length;
			let creativeList = Creatives.slice(
				(page - 1) * limit,
				page * limit
			);

			const promises = [];
			creativeList.forEach((CreativeDetail) => {
				if (CreativeDetail.creative_type === "html5") {
					if (!fs.existsSync("uploads/")) {
						fs.mkdirSync("uploads/", {
							recursive: true,
							mode: 0o777,
						});
					}
					const dest = "uploads/" + CreativeDetail._id + ".zip";
					const unzipPath = "uploads/" + CreativeDetail._id + "/";
					const url =
						process.env.BASE_URL + "/" + unzipPath + "index.html";
					promises.push(
						new Promise<void>((resolve, reject) => {
							if (
								!fs.existsSync(
									process.env.BASE_URL + "/" + dest
								)
							) {
								const file = fs.createWriteStream(dest, {
									flags: "wx",
								});
								const request = http.get(
									CreativeDetail.url,
									(response) => {
										if (response.statusCode === 200) {
											response.pipe(file);
										}
									}
								);
								file.on("finish", () => {
									if (
										!fs.existsSync(
											"uploads/" + CreativeDetail._id
										)
									) {
										// fs.mkdirSync("uploads/" + CreativeDetail._id);
										try {
											fs.mkdirSync(
												"uploads/" + CreativeDetail._id,
												{ recursive: true, mode: 0o777 }
											);
											console.log(
												"New folder created with 777 permissions!"
											);
										} catch (err) {
											console.error(err);
										}
									}
									fs.createReadStream(dest)
										.pipe(
											unzipper.Extract({
												path: unzipPath,
											})
										)
										.on("error", (e) => {
											reject(e);
										})
										.on("finish", () => {
											fs.unlink(dest, async (err) => {
												if (err) throw err;
												CreativeDetail.preview_url =
													url;
												resolve();
											});
										});
								});
								file.on("error", (err) => {
									reject(err);
								});
							} else {
								CreativeDetail.preview_url = url;
								resolve();
							}
						})
					);
				}
			});

			await Promise.all(promises);

			const response = {
				page,
				limit,
				total_records,
				creatives: creativeList,
			};

			return response;
		} catch (err) {
			let errorMgs = "Creative list not found.";
			await errorResonse(errorMgs, err);
		}
	}

	@Query((returns) => CreativeType)
	async creativeDetail(
		@Ctx() { req, parent, _token },
		@Arg("_id", { nullable: false }) _id: string
	) {
		await verifyToken(_token);

		try {
			let CreativeDetail = await Creative.findOne({ _id: _id });
			if (CreativeDetail.creative_type == "html5") {
				if (!fs.existsSync("uploads/")) {
					fs.mkdirSync("uploads/");
				}
				let dest = "uploads/" + CreativeDetail._id + ".zip";
				const file = fs.createWriteStream(dest, { flags: "wx" });
				const request = http.get(CreativeDetail.url, (response) => {
					if (response.statusCode === 200) {
						response.pipe(file);
					}
				});
				let unzipPath = "uploads/" + CreativeDetail._id + "/";
				await fs.access(dest, fs.constants.F_OK, async (err) => {
					if (err) {
						await new Promise(async (fileResolve, fileReject) => {
							await file.on("finish", () => {
								if (
									!fs.existsSync(
										"uploads/" + CreativeDetail._id
									)
								) {
									console.log("5");
									fs.mkdirSync(
										"uploads/" + CreativeDetail._id
									);
									fs.createReadStream(dest)
										.pipe(
											unzipper.Extract({
												path: unzipPath,
											})
										)
										.on("error", (e) => {
											console.log(e);
										})
										.on("finish", () => {
											fs.unlink(dest, async (err) => {
												if (err) throw err;
												console.log("outelse");
												let previewUrl =
													process.env.BASE_URL +
													"/" +
													unzipPath +
													"index.html";
												CreativeDetail.preview_url =
													previewUrl;

												console.log(
													"previewUrl",
													previewUrl
												);
											});
										});
								} else {
									console.log("else");
									let previewUrl =
										process.env.BASE_URL +
										"/" +
										unzipPath +
										"index.html";
									CreativeDetail.preview_url = previewUrl;
									console.log("previewUrl", previewUrl);
								}
							});
						});
					} else {
						let previewUrl =
							process.env.BASE_URL +
							"/" +
							unzipPath +
							"index.html";
						console.log("previewUrl", previewUrl);
						CreativeDetail.preview_url = previewUrl;
					}
				});
			}
			return CreativeDetail;
		} catch (error) {
			let errorMgs = "Creative not found.";
			await errorResonse(errorMgs, error);
		}
	}

	@Query((returns) => String)
	async creativePreview(
		@Ctx() { req, parent, _token },
		@Arg("_id", { nullable: false }) _id: string
	) {
		await verifyToken(_token);
		try {
			let CreativeDetail = await Creative.findOne({ _id: _id });
			if (CreativeDetail.creative_type == "html5") {
				if (!fs.existsSync("uploads/")) {
					fs.mkdirSync("uploads/");
				}
				let dest = "uploads/" + CreativeDetail._id + ".zip";
				let unzipPath = "uploads/" + CreativeDetail._id + "/";
				if (!fs.existsSync(dest)) {
					console.log("in if");
					const file = fs.createWriteStream(dest, { flags: "wx" });
					const request = http.get(CreativeDetail.url, (response) => {
						if (response.statusCode === 200) {
							response.pipe(file);
						}
					});
					await new Promise((fileResolve, fileReject) => {
						file.on("finish", () => {
							if (
								!fs.existsSync("uploads/" + CreativeDetail._id)
							) {
								console.log("5");
								fs.mkdirSync("uploads/" + CreativeDetail._id);
								fs.createReadStream(dest)
									.pipe(
										unzipper.Extract({
											path: unzipPath,
										})
									)
									.on("error", (e) => {
										console.log(e);
										fileReject(e);
									})
									.on("finish", () => {
										fs.unlink(dest, async (err) => {
											if (err) throw err;
											fileResolve(
												process.env.BASE_URL +
													"/" +
													unzipPath +
													"index.html"
											);
										});
									});
							} else {
								fileResolve(
									process.env.BASE_URL +
										"/" +
										unzipPath +
										"index.html"
								);
							}
						});
						file.on("error", (err) => {
							console.log(err);
							fileReject(err);
						});
					});
					return (
						(await process.env.BASE_URL) +
						"/" +
						unzipPath +
						"index.html"
					);
				} else {
					console.log(
						"in else",
						process.env.BASE_URL + "/" + unzipPath + "index.html"
					);
					return (
						process.env.BASE_URL + "/" + unzipPath + "index.html"
					);
				}
			}
		} catch (error) {
			let errorMgs = "Creative not found.";
			await errorResonse(errorMgs, error);
		}
	}

	@Query((returns) => CreativeType)
	async deleteCreative(
		@Ctx() { req, parent, _token },
		@Arg("delete", { nullable: true }) deleteFlag: boolean,
		@Arg("_id", { nullable: true }) _id: string
	) {
		return new Promise(async (resolve, reject) => {
			await verifyToken(_token);
			try {
				// If creative exist in campaign then not delete creative
				const campaignExist = await Campaign.find({
					creative: { $in: _id },
				});

				if (campaignExist.length > 0) {
					const error =
						"Failed to delete, this creative is being used in campaign";
					reject(error);
				}

				let CreativeDetail = await Creative.findOne({ _id: _id });
				if (deleteFlag) {
					CreativeDetail.is_deleted = deleteFlag;
				}
				const result = CreativeDetail.save();
				return resolve(result);
			} catch (err) {
				reject(err);
			}
		}).catch(async (error) => {
			let errorMgs =
				"Failed to delete, this creative is being used in campaign";
			await errorResonse(errorMgs, error);
		});
	}

	@Mutation((returns) => CreativeType)
	async editCreative(
		@Ctx() { req, parent, _token },
		@Arg("name", { nullable: true }) name: string,
		@Arg("size", { nullable: true }) size: string,
		@Arg("url", { nullable: true }) url: string,
		@Arg("creative_type", { nullable: true }) creativeType: string,
		@Arg("delete", { nullable: true }) deleteFlag: boolean,
		@Arg("_id", { nullable: false }) _id: string
	) {
		return new Promise(async (resolve, reject) => {
			await verifyToken(_token);
			try {
				const filter = { _id: _id };
				const options = { new: true };
				const update = {
					name: name,
					size: size,
					url: url,
					creative_type: creativeType,
					is_deleted: deleteFlag,
				};

				const CreativeData = await Creative.findByIdAndUpdate(
					filter,
					update,
					options
				);
				return resolve(CreativeData);
			} catch (err) {
				console.log(
					"try catch error while updating creative detail ==>> ",
					err
				);
				reject(err);
			}
		}).catch(async (error) => {
			let errorMgs = "Edit creative failed..!!";
			await errorResonse(errorMgs, error);
		});
	}
}
