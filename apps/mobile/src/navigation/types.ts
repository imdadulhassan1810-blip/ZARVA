export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  Register: undefined;
  Category: { slug: string };
  ListingDetail: { id: string; date?: string };
  Cart: undefined;
  Bills: undefined;
  Orders: undefined;
  Profile: undefined;
  Tracking: { orderId: string };
  Admin: undefined;
};
