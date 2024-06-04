export const adjustCommission = (
	currentValue: number,
	commissionPercentage: number
) => {
	const originalValue = currentValue / (1 - commissionPercentage / 100);
	return originalValue;
};

export const addCommission = (
	currentValue: number,
	commissionPercentage: number
) => {
	const commissionAmount = currentValue * (commissionPercentage / 100);
	const valueAfterCommissionIsTaken = currentValue - commissionAmount;
	return valueAfterCommissionIsTaken;
};
