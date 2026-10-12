// @paystack/inline-js ships no types. Only the surface this app uses.
declare module '@paystack/inline-js' {
  export interface PaystackResumeCallbacks {
    onSuccess?: (transaction: { id: number; reference: string; message: string }) => void;
    onCancel?: () => void;
    onLoad?: (response: { id: number; accessCode: string }) => void;
    onError?: (error: { message: string }) => void;
  }

  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: PaystackResumeCallbacks): unknown;
  }
}
