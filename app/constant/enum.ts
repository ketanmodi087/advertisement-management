export enum USER_TYPE {
	SUPER_ADMIN = "superadmin",
	ADMIN = "admin",
	CUSTOMER = "customer",
}

export enum CAMPAIGN_STATUS {
	ACTIVE = "Active",
	PAUSED = "Paused",
	PENDING = "Pending",
	PENDING_CHANGE = "Pending Change",
	APPROVED = "Approved",
	REJECTED = "Rejected",
	DRAFT = "Draft",
}

export enum CAMPAIGN_STATUS_REQUEST {
	PAUSE = "Pause",
	ACTIVE = "Active",
	RESUME = "Resume",
	UPDATE = "Update",
	COPY = "Copy",
}

export enum CAMPAIGN_CHANNEL {
	GAM = "gam",
	MANUAL = "manual",
}

export enum DEVICE_TARGETING {
    WINDOWS =  'Windows',
    LINUX = 'Linux',
    MAC = 'Mac OS',
    ANDROID = 'Android',
    IOS = 'iOS',
    OTHER = 'Other'
}

export enum MINIMUM_VALUES {
    TOP_UP_AMOUNT = 250
}