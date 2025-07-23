import ArrowDownIcon from "@/app/components/icons/ArrowDownIcon";
import ArrowUpIcon from "@/app/components/icons/ArrowUpIcon";
import { useVault } from "@/context/VaultContext";
import { useView } from "@/context/ViewContext";
import { useBalanceOf } from "@/lib/contracts/hooks/useBalanceOf";
import { useDeposit } from "@/lib/contracts/hooks/useDeposit";
import { useWithdraw } from "@/lib/contracts/hooks/useWithdraw";
import { VaultDataView } from "@/lib/data/types/DataPresenter.types";
import { getTypedChainId } from "@/lib/utils/chain";
import { getEnvVars } from "@/lib/utils/env";
import { useAppKitNetwork } from "@reown/appkit/react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Button from "./ui/common/Button";
import Card, { CardRow } from "./ui/common/Card";
import Dialog, {
  DialogActionButtons,
  DialogContents,
} from "./ui/common/Dialog";
import Input from "./ui/common/Input";
import LoadingComponent from "./ui/common/LoadingComponent";
import ObservationCard from "./ui/common/ObservationCard";
import Select from "./ui/common/Select";
import Toast, { ToastType } from "./ui/common/Toast";
import WarningCard from "./ui/common/WarningCard";
import { useActionSlot } from "./ui/layout/ActionSlotProvider";

export default function VaultView() {
  const { address } = useParams();
  const network = useAppKitNetwork();
  const { vault, isLoading } = useVault();
  const queryClient = useQueryClient();
  const { isChangingView, setViewLoaded } = useView();
  const vaultData: VaultDataView | undefined = useMemo(
    () => vault?.vaultData,
    [vault?.vaultData]
  );
  const { submitRequestDepositOnMulticallSafe4337 } = useDeposit();
  const { submitRequestWithdraw } = useWithdraw();

  const { setActions } = useActionSlot();
  const [showDialog, setShowDialog] = useState(false);
  const [operation, setOperation] = useState<"deposit" | "withdraw" | null>(
    null
  );
  const [amount, setAmount] = useState("");

  const {
    IS_UNDERLYING_WRAP_NATIVE: isUnderlyingWrapNative,
    UNDERLYING_NATIVE_TOKEN_SYMB: underlyingNativeTokenSymb,
    UNDERLYING_TOKEN_SYMB: underlyingTokenSymb,
    SHARE_TOKEN_SYMB: shareTokenSymb,
  } = getEnvVars(getTypedChainId(Number(network.chainId)));

  const [selectedToken, setSelectedToken] =
    useState<string>(underlyingTokenSymb);
  const { getBalanceOf, getNativeBalance, getUnderlyingBalanceOf } =
    useBalanceOf();
  const [walletBalance, setWalletBalance] = useState<string>("");
  const [walletNativeBalance, setWalletNativeBalance] = useState<string>("");
  const [sharesReadyToWithdraw, setSharesReadyToWithdraw] =
    useState<string>("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<ToastType>("info");

  useEffect(() => {
    const retrieveNativeBalance = async () => {
      const nativeBalance = await getNativeBalance();
      setWalletNativeBalance(nativeBalance);
    };

    if (!isLoading && vaultData) {
      setViewLoaded();
      if (isUnderlyingWrapNative) {
        retrieveNativeBalance();
      }
    }
  }, [
    isLoading,
    vaultData,
    setViewLoaded,
    isUnderlyingWrapNative,
    getNativeBalance,
  ]);

  const handleOperation = (op: "deposit" | "withdraw") => {
    setOperation(op);
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    setShowDialog(false);
    if (operation === "deposit") {
      try {
        const wrapNativeToken =
          isUnderlyingWrapNative && selectedToken !== underlyingTokenSymb;
        //const tx = await submitRequestDeposit(amount, wrapNativeToken);
        const tx = await submitRequestDepositOnMulticallSafe4337(
          amount,
          wrapNativeToken
        );
        setToastMessage("Deposit request submitted!");
        setToastType("info");
        setShowToast(true);

        await tx.wait();
        setToastMessage("Deposit request confirmed!");
        setToastType("success");
        setShowToast(true);
      } catch (error) {
        console.error("Error in deposit process:", error);
        setToastMessage("Error submitting deposit request");
        setToastType("error");
        setShowToast(true);
      }
    } else {
      try {
        const tx = await submitRequestWithdraw(amount);
        setToastMessage("Withdraw request submitted!");
        setToastType("info");
        setShowToast(true);

        await tx.wait();
        setToastMessage("Withdraw request confirmed!");
        setToastType("success");
        setShowToast(true);
      } catch (error) {
        console.error("Error in withdraw process:", error);
        setToastMessage("Error submitting withdraw request");
        setToastType("error");
        setShowToast(true);
      }
    }
    setAmount("");
    setOperation(null);
    // Invalidate and refetch vault data
    queryClient.invalidateQueries({ queryKey: ["vaultData", address] });
  };

  const handleMaxClick = () => {
    setAmount(
      operation === "deposit"
        ? selectedToken === underlyingTokenSymb
          ? walletBalance
          : walletNativeBalance
        : sharesReadyToWithdraw
    );
  };

  useEffect(() => {
    const fetchUnderlyingBalance = async () => {
      try {
        const balance = await getUnderlyingBalanceOf();
        setWalletBalance(balance);
      } catch (err) {
        console.warn("Failed to fetch balance:", err);
        setWalletBalance("");
      }
    };

    if (address) {
      fetchUnderlyingBalance();
    } else {
      setWalletBalance("");
    }
  }, [getUnderlyingBalanceOf, address]);

  useEffect(() => {
    const fetchSharesReadyToWithdraw = async () => {
      try {
        const balance = await getBalanceOf();
        setSharesReadyToWithdraw(balance);
      } catch (err) {
        console.warn("Failed to fetch balance:", err);
        setSharesReadyToWithdraw("");
      }
    };

    if (address) {
      fetchSharesReadyToWithdraw();
    } else {
      setSharesReadyToWithdraw("");
    }
  }, [getBalanceOf, address]);

  useEffect(() => {
    setActions(
      <>
        <Button onClick={() => handleOperation("deposit")}>
          <ArrowUpIcon />
          <span>Deposit</span>
        </Button>
        <Button onClick={() => handleOperation("withdraw")}>
          <ArrowDownIcon />
          <span>Withdraw</span>
        </Button>
      </>
    );
    return () => setActions(null); // Clean up when component unmounts
  }, [setActions]);

  if (isLoading || isChangingView || !vaultData) {
    return <LoadingComponent text="Loading vault data..." />;
  }

  return (
    vaultData && (
      <>
        <Card
          title="Vault Overview"
          subtitle="Performance metrics for this liquidity vault"
          variant="large"
        >
          <CardRow
            left="TVL"
            right={vaultData.tvl}
            secondaryRight={vaultData.tvlChange}
          />
          <CardRow
            left="APY (12h avg)"
            tooltip="Average annual percentage rate based on the last 12 hours of performance."
            highlightedRight
            right={vaultData.apr}
            secondaryRight={vaultData.aprChange}
          />
          <CardRow
            left="Value Gained"
            highlightedRight
            right={vaultData.valueGained}
            secondaryRight={vaultData.valueGainedUSD}
          />
          <CardRow
            left="Your Position"
            right={vaultData.position}
            secondaryRight={vaultData.positionUSD}
          />
        </Card>

        {/* Dialog */}
        <Dialog
          open={showDialog}
          onClose={() => setShowDialog(false)}
          title={
            operation === "deposit"
              ? `Deposit ${underlyingTokenSymb}`
              : `Withdraw ${underlyingTokenSymb}`
          }
        >
          <DialogContents>
            {operation === "deposit" &&
              !!isUnderlyingWrapNative &&
              isUnderlyingWrapNative && (
                <Select
                  label="Token"
                  options={[underlyingTokenSymb, underlyingNativeTokenSymb]}
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                />
              )}
            <Input
              type="number"
              label={`Amount (${
                operation === "deposit" ? selectedToken : underlyingTokenSymb
              })`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              handleMaxClick={handleMaxClick}
              labelMax={
                <>
                  Max:{" "}
                  {operation === "deposit"
                    ? selectedToken === underlyingTokenSymb
                      ? walletBalance + " " + underlyingTokenSymb
                      : walletNativeBalance + " " + underlyingNativeTokenSymb
                    : sharesReadyToWithdraw + " " + underlyingTokenSymb}
                </>
              }
              placeholder="0.0"
            />

            {operation === "deposit" && (
              <ObservationCard title="Deposit Process">
                This is a two-step process:
                <br />
                1. Your {underlyingTokenSymb} will be deposited into the vault
                <br />
                2. You&apos;ll receive {shareTokenSymb} shares
              </ObservationCard>
            )}

            {operation === "withdraw" && (
              <>
                <ObservationCard title="Withdrawal Process">
                  This is a two-step process:
                  <br />
                  1. Your {shareTokenSymb} shares will be burned
                  <br />
                  2. You&apos;ll need to redeem your {underlyingTokenSymb}{" "}
                  assets after settlement
                </ObservationCard>

                <WarningCard title="Withdrawal Disclaimer">
                  Withdrawn assets will stop generating yield and will no longer
                  be part of the total value. Redeem them anytime after
                  settlement.
                </WarningCard>
              </>
            )}
          </DialogContents>

          <DialogActionButtons>
            <Button variant="secondary" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {operation === "deposit" ? "Deposit" : "Withdraw"}
            </Button>
          </DialogActionButtons>
        </Dialog>

        {/* Toast */}
        <Toast
          show={showToast}
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
          duration={5000}
        />
      </>
    )
  );
}
