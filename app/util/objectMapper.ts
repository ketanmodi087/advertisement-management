import { Campaign } from "../schema/campaign.schema";

interface GamReport {
	campaign_id: string;
	creativeName: string;
	creativeSize: string;
	country: string;
	date: string;
	deviceCategory: string;
	impressions: number;
	clicks: number;
	spends: number;
	ctr: number;
	cpm: number;
}

export const gamReportDataMapper = async (
	gamReports: any[]
): Promise<GamReport[] | []> => {
	// return empty array if report is empty
	if (!Array.isArray(gamReports) || gamReports.length === 0) {
		return [];
	}

	// this line removes the last element from array which representing total row values
	gamReports.pop();

	const convertedArr: GamReport[] = [];

	for (const gamReport of gamReports) {
		const {
			"DimensionAttribute.ORDER_PO_NUMBER": campaign_id,
			"Dimension.CREATIVE_NAME": creativeName,
			"Dimension.CREATIVE_SIZE": creativeSize,
			"Dimension.COUNTRY_CODE": country,
			"Dimension.DATE": date,
			"Dimension.DEVICE_CATEGORY_NAME": deviceCategory,
			"Column.TOTAL_LINE_ITEM_LEVEL_IMPRESSIONS": impressions,
			"Column.TOTAL_LINE_ITEM_LEVEL_CLICKS": clicks,
			"Column.TOTAL_LINE_ITEM_LEVEL_CPM_AND_CPC_REVENUE": spends,
			"Column.TOTAL_LINE_ITEM_LEVEL_CTR": ctr,
			"Column.TOTAL_LINE_ITEM_LEVEL_WITHOUT_CPD_AVERAGE_ECPM": cpm,
		} = gamReport;

		convertedArr.push({
			campaign_id,
			creativeName,
			creativeSize,
			country,
			date,
			deviceCategory,
			impressions,
			clicks,
			spends: spends / 1000000, //gam gives values in 1000000 multiple
			ctr,
			cpm: cpm / 1000000, //gam gives values in 1000000 multiple
		});
	}

	return convertedArr;
};

// maps the current campaignData to previous_campaign_values field.
// requirement is to show previous values to admin.
// cannot copy whole campaign Data.
// 1. GAM object is too big to copy and won't be needed
// 2. copying previous_campaign_values to previous_campaign_values, could result in circular object
export const campaignPreviousValuesMapper = (campaignData: Campaign) => {
	// applying nullish operator
	const {
		_id,
		name = "",
		countries = "",
		objectives = "",
		interest_categories = "",
		device_targeting = "",
		number_of_impression = "",
		time_frame = "",
		total_budget = "",
		daily_budget = "",
		cpm_bid = "",
		commission = "",
		balance = "",
		spent = "",
		is_active = "",
		status = "",
		request_type = "",
		utm_url = "",
		creative = "",
		impressions = "",
		channel = "",
		approved_by = "",
		rejected_reason = "",
	} = campaignData;

	return {
		_id,
		name,
		countries,
		objectives,
		interest_categories,
		device_targeting,
		number_of_impression,
		time_frame,
		total_budget,
		daily_budget,
		cpm_bid,
		commission,
		balance,
		spent,
		is_active,
		status,
		request_type,
		utm_url,
		creative,
		impressions,
		channel,
		approved_by,
		rejected_reason,
	};
};
