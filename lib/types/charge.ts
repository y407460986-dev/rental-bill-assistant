export interface ChargeCalculation {
  tenantId: string;
  daysOccupied: number;
  shareBeforeRounding: string;
  actualShare: string;
  remainderCents: number;
  netAmountDue: string;
}
