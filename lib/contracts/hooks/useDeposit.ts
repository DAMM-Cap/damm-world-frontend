import { TransactionResponse } from "@ethersproject/providers";
import { useAppKitNetwork } from "@reown/appkit/react";
import { parseUnits } from "ethers/lib/utils";
import { useAccount } from "wagmi";
import { batchTxs, Call, MULTICALL3_ADDRESS } from "../utils/BatchTxs";
import {
  getApproveTx,
  getWrapNativeETHTx,
  handleApprove,
  wrapNativeETH,
} from "../utils/TokenUtils";
import { getSignerAndContract } from "../utils/utils";
import { useSafe4337BatchTx } from "./useSafe4337Batch";

export interface Safe4337Tx {
  to: string;
  value: string;
  data: string;
}

export function useDeposit() {
  const { address } = useAccount();
  const network = useAppKitNetwork();
  const { sendBatchTx } = useSafe4337BatchTx();

  const cancelDepositRequest = async () => {
    if (!address) throw new Error("No address found");

    const chainId = network.chainId?.toString() ?? "";
    const { vault } = await getSignerAndContract(chainId);

    const tx = await vault.cancelRequestDeposit();
    return tx as unknown as TransactionResponse;
  };

  const submitRequestDeposit = async (
    amount: string,
    wrapNativeToken: boolean
  ) => {
    if (!address) throw new Error("No address found");

    const chainId = network.chainId?.toString() ?? "";
    const { vault, tokenMetadata } = await getSignerAndContract(chainId);

    if (wrapNativeToken) {
      await wrapNativeETH(chainId, amount);
    }

    const amountInWei = parseUnits(amount, tokenMetadata.decimals);
    await handleApprove(chainId, address, vault.address, amountInWei);
    const tx = await vault["requestDeposit(uint256,address,address,address)"](
      amountInWei,
      address,
      address,
      address
    );
    return tx as unknown as TransactionResponse;
  };

  const submitRequestDepositOnMulticall = async (
    amount: string,
    wrapNativeToken: boolean
  ) => {
    if (!address) throw new Error("No address found");

    const chainId = network.chainId?.toString() ?? "";
    const { vault, tokenMetadata } = await getSignerAndContract(chainId);

    if (wrapNativeToken) {
      await wrapNativeETH(chainId, amount);
    }

    const amountInWei = parseUnits(amount, tokenMetadata.decimals);
    const calls: Call[] = [];

    const setOperatorTx = await vault.setOperator(MULTICALL3_ADDRESS, true);
    await setOperatorTx.wait();
    console.log("setOperatorTx", setOperatorTx);

    /* const setOperatorCall = {
      target: vault.address,
      allowFailure: false,
      callData: vault.interface.encodeFunctionData("setOperator", [
        MULTICALL3_ADDRESS,
        true,
      ]),
    };
    calls.push(setOperatorCall); */

    const approveTx = await getApproveTx(
      chainId,
      address,
      vault.address,
      amountInWei
    );
    if (approveTx) {
      calls.push(approveTx);
    }
    const requestDepositCall = {
      target: vault.address,
      allowFailure: false,
      callData: vault.interface.encodeFunctionData(
        "requestDeposit(uint256,address,address,address)",
        [amountInWei, address, address, address]
      ),
    };
    calls.push(requestDepositCall);

    /* const revokeOperatorCall = {
      target: vault.address,
      allowFailure: true,
      callData: vault.interface.encodeFunctionData("setOperator", [
        MULTICALL3_ADDRESS,
        false,
      ]),
    };
    calls.push(revokeOperatorCall); */

    try {
      // Pass ETH value if wrapping native token
      const value = wrapNativeToken ? amountInWei.toString() : undefined;
      const tx = await batchTxs(chainId, calls, value);
      return tx as unknown as TransactionResponse;
    } catch (error) {
      console.warn(
        "Batch transaction failed, falling back to sequential:",
        error
      );
      return await submitRequestDeposit(amount, wrapNativeToken);
    }
  };

  const submitRequestDepositOnMulticallSafe4337 = async (
    amount: string,
    wrapNativeToken: boolean
  ) => {
    if (!address) throw new Error("No address found");

    const chainId = network.chainId?.toString() ?? "";
    const { vault, tokenMetadata } = await getSignerAndContract(chainId);

    const amountInWei = parseUnits(amount, tokenMetadata.decimals);

    const calls: Safe4337Tx[] = [];

    if (wrapNativeToken) {
      const wrapNativeETHTx = await getWrapNativeETHTx(chainId);
      if (wrapNativeETHTx) {
        const wrapNativeETHTxCall = {
          to: wrapNativeETHTx.target,
          value: amountInWei.toString(),
          data: wrapNativeETHTx.callData,
        };
        calls.push(wrapNativeETHTxCall);
      }
    }

    const approveTx = await getApproveTx(
      chainId,
      address,
      vault.address,
      amountInWei
    );
    if (approveTx) {
      const approveTxCall = {
        to: approveTx.target,
        value: "0",
        data: approveTx.callData,
      };
      calls.push(approveTxCall);
    }
    const requestDepositCall = {
      to: vault.address,
      value: "0",
      data: vault.interface.encodeFunctionData(
        "requestDeposit(uint256,address,address,address)",
        [amountInWei, address, address, address]
      ),
    };
    calls.push(requestDepositCall);

    try {
      const tx = await sendBatchTx(calls);
      return tx as unknown as TransactionResponse;
    } catch (error) {
      console.warn(
        "Safe4337 batch transaction failed, falling back to sequential:",
        error
      );
      return await submitRequestDeposit(amount, wrapNativeToken);
    }
  };

  return {
    submitRequestDeposit,
    submitRequestDepositOnMulticall,
    submitRequestDepositOnMulticallSafe4337,
    cancelDepositRequest,
  };
}
