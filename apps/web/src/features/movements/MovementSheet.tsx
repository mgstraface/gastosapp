import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  METHOD_LABELS,
  accountBalances,
  addMonths,
  amountToInput,
  formatMoney,
  installmentAmount,
  localDate,
  monthLabel,
  monthOf,
  monthSummary,
  parseAmount,
  rateFor,
  type Account,
  type AiStatus,
  type Method,
  type MovementDraft,
  type MovementKind,
} from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { api, errorText } from '../../lib/api';
import { preparePhoto } from '../../lib/photo';
import { useSettings, useStore } from '../../lib/store';
import type { MovementPrefill, MovementSheetTarget } from './registerContext';

const QUICK_INSTALLMENTS = [1, 3, 6, 9, 12, 18, 24];
const GASTO_METHODS: Method[] = ['debito', 'credito', 'efectivo', 'transferencia', 'otro'];

export function MovementSheet({ target, onClose }: { target: MovementSheetTarget | null; onClose: () => void }) {
  const settings = useSettings();
  const addMovement = useStore((s) => s.addMovement);
  const updateMovement = useStore((s) => s.updateMovement);
  const deleteMovement = useStore((s) => s.deleteMovement);
  const movements = useStore((s) => s.movements);
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const saveSettings = useStore((s) => s.saveSettings);
  const showToast = useStore((s) => s.showToast);

  const editing = target?.mode === 'edit' ? target.movement : null;

  const [kind, setKind] = useState<MovementKind>('gasto');
  const [amountText, setAmountText] = useState('');
  const [toAmountText, setToAmountText] = useState('');
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [toAccountKey, setToAccountKey] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState('');
  const [date, setDate] = useState(localDate());
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<Method>('debito');
  const [installments, setInstallments] = useState(1);
  const [recurringKey, setRecurringKey] = useState<string | null>(null);
  // Compartido
  const [splitOn, setSplitOn] = useState(false);
  const [splitPerson, setSplitPerson] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<'me' | 'them'>('me');
  const [myPartText, setMyPartText] = useState('');
  // Transferencia con una persona (saldar)
  const [personKey, setPersonKey] = useState<string | null>(null);
  const [personDir, setPersonDir] = useState<'pago' | 'cobro'>('pago');
  // Pago de tarjeta: dejarla al día
  const [settleCard, setSettleCard] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const usable = (a: Account) => !a.archived || a.key === editing?.accountKey || a.key === editing?.toAccountKey;
  const accounts = settings.accounts.filter(usable);
  const lastGasto = movements.find((m) => m.kind === 'gasto' && m.accountKey);
  const lastIngreso = movements.find((m) => m.kind === 'ingreso' && m.accountKey);
  const firstAccount = accounts.find((a) => a.currency === settings.currency && a.type === 'normal')?.key ?? accounts[0]?.key ?? null;

  const applyPrefill = (p: MovementPrefill) => {
    if (p.kind) setKind(p.kind);
    if (p.amount) setAmountText(amountToInput(p.amount));
    if (p.categoryKey !== undefined) setCategoryKey(p.categoryKey ?? '');
    if (p.accountKey !== undefined) setAccountKey(p.accountKey);
    if (p.toAccountKey !== undefined) setToAccountKey(p.toAccountKey);
    if (p.description !== undefined) setDescription(p.description);
    if (p.date) setDate(p.date);
    if (p.method) setMethod(p.method);
    if (p.installments) setInstallments(p.installments);
    if (p.recurringKey !== undefined) setRecurringKey(p.recurringKey);
    if (p.split) {
      setSplitOn(true);
      setSplitPerson(p.split.personKey);
      setPaidBy(p.split.paidBy);
      setMyPartText(amountToInput(p.split.myPart));
    }
    if (p.settleCard) setSettleCard(true);
    if (p.personKey !== undefined) {
      setPersonKey(p.personKey);
      setPersonDir(p.toAccountKey ? 'cobro' : 'pago');
    }
  };

  useEffect(() => {
    if (!target) return;
    setError(null);
    setAiNote(null);
    setBusy(false);
    setConfirmDelete(false);
    setToAmountText('');
    setSplitOn(false);
    setSplitPerson(null);
    setPaidBy('me');
    setMyPartText('');
    setPersonKey(null);
    setPersonDir('pago');
    setRecurringKey(null);
    setSettleCard(false);
    if (target.mode === 'edit') {
      const m = target.movement;
      setAmountText(amountToInput(m.amount));
      setToAmountText(m.toAmount ? amountToInput(m.toAmount) : '');
      applyPrefill({ ...m, amount: null });
      setAccountKey(m.accountKey);
      setToAccountKey(m.toAccountKey);
    } else {
      const k = target.prefill?.kind ?? target.kind ?? 'gasto';
      const last = k === 'ingreso' ? lastIngreso : lastGasto;
      setAmountText('');
      setCategoryKey('');
      setDescription('');
      setDate(target.date ?? localDate());
      setMethod(k === 'ingreso' ? 'transferencia' : (lastGasto?.method ?? 'debito'));
      setInstallments(1);
      setAccountKey(target.accountKey ?? (last?.accountKey && accounts.some((a) => a.key === last.accountKey && !a.archived) ? last.accountKey : firstAccount));
      setToAccountKey(null);
      setKind(k);
      if (target.prefill) applyPrefill(target.prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const categories = useMemo(
    () => settings.categories.filter((c) => c.kind === kind && (!c.archived || c.key === editing?.categoryKey)),
    [settings.categories, kind, editing],
  );

  const isPersonTransfer = kind === 'transferencia' && !!personKey;
  const person = settings.people.find((p) => p.key === (isPersonTransfer ? personKey : splitPerson)) ?? null;
  const theyPaid = kind === 'gasto' && splitOn && paidBy === 'them';

  // Cuenta "mía" del movimiento: en un cobro de una persona es la de destino
  const ownKey = isPersonTransfer && personDir === 'cobro' ? toAccountKey : accountKey;
  const own = accounts.find((a) => a.key === ownKey) ?? null;
  const from = accounts.find((a) => a.key === accountKey) ?? null;
  const to = accounts.find((a) => a.key === toAccountKey) ?? null;
  const isCard = kind === 'gasto' && from?.type === 'tarjeta' && !theyPaid;
  const currency = own?.currency ?? editing?.currency ?? settings.currency;
  const crossCurrency = kind === 'transferencia' && !isPersonTransfer && !!from && !!to && from.currency !== to.currency;

  const amount = parseAmount(amountText);
  const toAmount = crossCurrency ? parseAmount(toAmountText) : null;
  const effMethod: Method = isCard ? 'credito' : method;
  const showInstallments = kind === 'gasto' && effMethod === 'credito' && !theyPaid;
  const cuotas = showInstallments ? installments : 1;
  const myPart = splitOn ? parseAmount(myPartText) ?? (myPartText.trim() === '0' ? 0 : null) : null;

  // Cuánto se debe hoy en la tarjeta destino (para el pago del resumen)
  const cardDebt = useMemo(() => {
    if (editing || kind !== 'transferencia' || to?.type !== 'tarjeta') return null;
    const row = accountBalances(movements, settings, localDate()).accounts.find((r) => r.account.key === to.key);
    return row ? -row.balance : null;
  }, [editing, kind, to, movements, settings]);
  const cardLeft = cardDebt !== null && amount ? cardDebt - amount : null;

  const valid =
    !!amount &&
    !!date &&
    (kind === 'transferencia'
      ? isPersonTransfer
        ? !!own
        : !!from && !!to && to.key !== from.key && (!crossCurrency || !!toAmount)
      : categories.some((c) => c.key === categoryKey) && (theyPaid || !!from)) &&
    (!splitOn || kind !== 'gasto' || (!!splitPerson && myPart !== null && myPart <= amount));

  const save = async () => {
    if (!valid || !amount) return;
    setBusy(true);
    setError(null);
    const split = kind === 'gasto' && splitOn && splitPerson && myPart !== null ? { personKey: splitPerson, myPart, paidBy } : null;
    const input = {
      kind,
      amount,
      currency,
      categoryKey: kind === 'transferencia' ? '' : categoryKey,
      accountKey: isPersonTransfer ? (personDir === 'pago' ? accountKey : null) : theyPaid ? null : accountKey,
      toAccountKey: kind === 'transferencia' ? (isPersonTransfer ? (personDir === 'cobro' ? toAccountKey : null) : toAccountKey) : null,
      toAmount: crossCurrency ? toAmount : null,
      date,
      description: description.trim(),
      method: kind === 'transferencia' ? ('transferencia' as const) : effMethod,
      installments: cuotas,
      recurringKey,
      split,
      personKey: isPersonTransfer ? personKey : null,
    };
    try {
      // Para el aviso de presupuesto: cómo estaba la categoría antes de guardar
      const st = useStore.getState();
      const rate = rateFor(settings, st.rates);
      const month = monthOf(date);
      const before = kind === 'gasto' ? monthSummary(st.movements, month, settings, { rate }).byCategory.find((r) => r.category.key === categoryKey) : undefined;
      if (editing) await updateMovement(editing.id, input);
      else await addMovement(input);
      // Pagó el resumen: la diferencia (redondeos, centavos) se ajusta para que la tarjeta quede en cero
      if (!editing && settleCard && to?.type === 'tarjeta' && cardLeft && date <= localDate()) {
        const cur = useStore.getState().settings!;
        await saveSettings({ ...cur, accounts: cur.accounts.map((a) => (a.key === to.key ? { ...a, initialBalance: a.initialBalance + cardLeft } : a)) });
      }
      if (kind === 'gasto' && settings.budgetAlerts) {
        const after = monthSummary(useStore.getState().movements, month, settings, { rate }).byCategory.find((r) => r.category.key === categoryKey);
        const b = before?.ratio ?? 0;
        const a = after?.ratio ?? 0;
        if (after?.category.budget && a > b) {
          if (a > 1 && b <= 1) showToast(`${after.category.emoji} Te pasaste del tope de ${after.category.name} (${Math.round(a * 100)} %)`);
          else if (a >= 0.8 && b < 0.8) showToast(`${after.category.emoji} Llegaste al ${Math.round(a * 100)} % del tope de ${after.category.name}`);
        }
      }
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await deleteMovement(editing.id);
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const switchKind = (k: MovementKind) => {
    setKind(k);
    setCategoryKey('');
    setPersonKey(null);
    if (k !== 'gasto') setSplitOn(false);
    if (k !== 'gasto' && method === 'credito') setMethod('transferencia');
    if (k === 'transferencia' && toAccountKey === accountKey) setToAccountKey(null);
    // Las tarjetas solo sirven para gastos (o como destino, para pagarlas)
    if (k !== 'gasto' && from?.type === 'tarjeta') setAccountKey(firstAccount);
  };

  /** Lo que propuso la IA se vuelca en el formulario; la persona revisa y guarda. */
  const applyDraft = (d: MovementDraft, status: AiStatus) => {
    setAi(status);
    setKind(d.kind);
    if (d.amount) setAmountText(amountToInput(d.amount));
    setCategoryKey(d.categoryKey ?? '');
    if (d.accountKey) setAccountKey(d.accountKey);
    setToAccountKey(d.toAccountKey);
    setDescription(d.description);
    if (d.date) setDate(d.date);
    if (d.method) setMethod(d.method);
    setInstallments(d.installments || 1);
    const missing = [!d.amount && 'el monto', d.kind !== 'transferencia' && !d.categoryKey && 'la categoría', !d.accountKey && 'la cuenta'].filter(Boolean);
    setAiNote([d.note, missing.length ? `Completá ${missing.join(', ')}.` : 'Revisá que esté todo bien y guardá.'].filter(Boolean).join(' '));
  };

  const noun = kind === 'gasto' ? 'gasto' : kind === 'ingreso' ? 'ingreso' : 'transferencia';
  const title = editing ? `Editar ${noun}` : isPersonTransfer ? `Saldar con ${person?.name ?? ''}` : kind === 'transferencia' ? 'Nueva transferencia' : `Nuevo ${noun}`;
  const rate = crossCurrency && amount && toAmount && from ? Math.round(((from.currency === 'ARS' ? amount : toAmount) / (from.currency === 'ARS' ? toAmount : amount)) * 100) : null;

  const fromChoices = kind === 'ingreso' || kind === 'transferencia' ? accounts.filter((a) => a.type !== 'tarjeta') : accounts;

  return (
    <Sheet
      open={!!target}
      title={title}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button type="button" className={confirmDelete ? 'btn-danger' : 'btn-quiet'} onClick={() => void remove()} disabled={busy}>
              {confirmDelete ? '¿Seguro?' : 'Borrar'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || !valid}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      {!editing && ai.enabled && !isPersonTransfer && !recurringKey && <QuickEntry ai={ai} onDraft={applyDraft} />}
      {aiNote && <p className="notice">✨ {aiNote}</p>}

      {!isPersonTransfer && (
        <div className="segmented" role="tablist" aria-label="Tipo">
          {(['gasto', 'ingreso', 'transferencia'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => switchKind(k)}>
              {k === 'gasto' ? 'Gasto' : k === 'ingreso' ? 'Ingreso' : 'Transferencia'}
            </button>
          ))}
        </div>
      )}

      {isPersonTransfer && person && (
        <div className="segmented">
          <button type="button" className={personDir === 'pago' ? 'is-on' : ''} onClick={() => setPersonDir('pago')}>
            Le pagué a {person.name}
          </button>
          <button type="button" className={personDir === 'cobro' ? 'is-on' : ''} onClick={() => setPersonDir('cobro')}>
            {person.name} me pagó
          </button>
        </div>
      )}

      <div className="amount-row">
        <span className="currency-btn">{currency === 'USD' ? 'US$' : '$'}</span>
        <input
          className="amount-input"
          inputMode="decimal"
          placeholder="0"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))}
          autoFocus={!editing && !ai.enabled}
          aria-label="Monto"
        />
      </div>
      {amountText && !amount && <p className="form-error">No entendemos ese monto. Probá con algo como 12500 o 12.500,50</p>}

      {isPersonTransfer ? (
        <AccountPicker
          label={personDir === 'pago' ? '¿De qué cuenta salió?' : '¿A qué cuenta entró?'}
          accounts={accounts.filter((a) => a.type !== 'tarjeta')}
          value={personDir === 'pago' ? accountKey : toAccountKey}
          onChange={(k) => (personDir === 'pago' ? setAccountKey(k) : setToAccountKey(k))}
        />
      ) : (
        !theyPaid && (
          <AccountPicker
            label={kind === 'ingreso' ? '¿A qué cuenta entra?' : kind === 'transferencia' ? 'Sale de' : '¿De qué cuenta o tarjeta sale?'}
            accounts={fromChoices}
            value={accountKey}
            onChange={setAccountKey}
          />
        )
      )}
      {editing && !editing.accountKey && !accountKey && !theyPaid && !isPersonTransfer && (
        <p className="hint">Este movimiento es de antes de las cuentas: elegí una para que sume en su saldo.</p>
      )}

      {kind === 'transferencia' && !isPersonTransfer && (
        <>
          <AccountPicker label="Entra en" accounts={accounts.filter((a) => a.key !== accountKey)} value={toAccountKey} onChange={setToAccountKey} />
          {to?.type === 'tarjeta' && (
            <>
              <p className="hint">
                Así se registra el pago de la tarjeta: poné lo que pagaste exacto.
                {cardDebt !== null && cardDebt > 0 ? ` Hoy debés ${formatMoney(cardDebt, to.currency)}.` : ''}
              </p>
              {cardDebt !== null && cardDebt > 0 && (
                <label className="toggle-row">
                  <input type="checkbox" checked={settleCard} onChange={(e) => setSettleCard(e.target.checked)} />
                  <span>
                    Con esto queda pagado el resumen
                    {settleCard && cardLeft ? ` (se ajusta la diferencia de ${formatMoney(Math.abs(cardLeft), to.currency)})` : ''}
                  </span>
                </label>
              )}
              {cardDebt !== null && cardLeft !== null && cardLeft > 0 && !settleCard && (
                <p className="hint">Te quedarían {formatMoney(cardLeft, to.currency)} de deuda en la tarjeta.</p>
              )}
            </>
          )}
          {crossCurrency && to && (
            <label className="field">
              <span>
                ¿Cuánto entra en {to.name}? ({to.currency === 'USD' ? 'US$' : '$'})
              </span>
              <input inputMode="decimal" value={toAmountText} onChange={(e) => setToAmountText(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
              {rate && <small className="hint">Cotización: {formatMoney(rate, 'ARS')} por dólar</small>}
            </label>
          )}
        </>
      )}

      {kind !== 'transferencia' && (
        <fieldset className="field">
          <legend>Categoría</legend>
          <div className="cat-grid">
            {categories.map((c) => (
              <button key={c.key} type="button" className={`cat-btn${categoryKey === c.key ? ' is-on' : ''}`} style={{ '--cat': c.color } as CSSProperties} onClick={() => setCategoryKey(c.key)}>
                <span className="cat-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="field">
        <span>Detalle (opcional)</span>
        <input
          value={description}
          maxLength={120}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === 'gasto' ? 'Ej.: verdulería, nafta, regalo…' : kind === 'ingreso' ? 'Ej.: sueldo noviembre' : 'Ej.: saqué del cajero'}
        />
      </label>

      <label className="field">
        <span>Fecha</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {kind === 'gasto' && !isCard && !theyPaid && (
        <fieldset className="field">
          <legend>Cómo pagaste</legend>
          <div className="chips">
            {GASTO_METHODS.map((m) => (
              <button key={m} type="button" className={`chip-btn${method === m ? ' is-on' : ''}`} onClick={() => setMethod(m)}>
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {showInstallments && (
        <fieldset className="field">
          <legend>Cuotas</legend>
          <div className="chips">
            {QUICK_INSTALLMENTS.map((n) => (
              <button key={n} type="button" className={`chip-btn${installments === n ? ' is-on' : ''}`} onClick={() => setInstallments(n)}>
                {n === 1 ? '1 pago' : n}
              </button>
            ))}
            <input
              className="chip-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              aria-label="Otra cantidad de cuotas"
              value={QUICK_INSTALLMENTS.includes(installments) ? '' : installments}
              placeholder="Otra"
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (n >= 1 && n <= 60) setInstallments(n);
              }}
            />
          </div>
          {amount && (
            <p className="hint">
              {installments > 1
                ? `${installments} cuotas de ${formatMoney(installmentAmount(amount, installments, 1), currency)}, de ${monthLabel(monthOf(date))} a ${monthLabel(addMonths(monthOf(date), installments - 1))}. `
                : ''}
              {isCard
                ? `Cada cuota suma a lo que debés en ${from?.name} el mes que corresponde.`
                : from
                  ? `Cada mes, la cuota se descuenta de ${from.name} (desde donde pagás la tarjeta).`
                  : ''}
            </p>
          )}
        </fieldset>
      )}

      {kind === 'gasto' && (
        <SplitSection
          on={splitOn}
          setOn={(v) => {
            setSplitOn(v);
            if (v && !splitPerson) setSplitPerson(settings.people[0]?.key ?? null);
            if (v && !myPartText && amount) setMyPartText(amountToInput(Math.round(amount / 2)));
          }}
          personKey={splitPerson}
          setPersonKey={setSplitPerson}
          paidBy={paidBy}
          setPaidBy={setPaidBy}
          myPartText={myPartText}
          setMyPartText={setMyPartText}
          amount={amount}
          currency={currency}
        />
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function AccountPicker({ label, accounts, value, onChange }: { label: string; accounts: Account[]; value: string | null; onChange: (k: string) => void }) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="chips">
        {accounts.map((a) => (
          <button key={a.key} type="button" className={`chip-btn${value === a.key ? ' is-on' : ''}`} onClick={() => onChange(a.key)}>
            {a.emoji} {a.name}
            {a.currency === 'USD' && ' (US$)'}
          </button>
        ))}
      </div>
      {accounts.length === 0 && <p className="hint">Creá una cuenta en la pestaña Cuentas.</p>}
    </fieldset>
  );
}

function SplitSection(p: {
  on: boolean;
  setOn: (v: boolean) => void;
  personKey: string | null;
  setPersonKey: (k: string) => void;
  paidBy: 'me' | 'them';
  setPaidBy: (v: 'me' | 'them') => void;
  myPartText: string;
  setMyPartText: (v: string) => void;
  amount: number | null;
  currency: 'ARS' | 'USD';
}) {
  const settings = useSettings();
  const person = settings.people.find((x) => x.key === p.personKey);
  if (!settings.people.length) {
    return <p className="hint">¿Gastos a medias? Sumá personas en Yo → Gastos compartidos.</p>;
  }
  const myPart = parseAmount(p.myPartText) ?? (p.myPartText.trim() === '0' ? 0 : null);
  return (
    <fieldset className="field split-box">
      <label className="toggle-row">
        <input type="checkbox" checked={p.on} onChange={(e) => p.setOn(e.target.checked)} />
        <span>👥 Gasto compartido</span>
      </label>
      {p.on && (
        <>
          <div className="chips">
            {settings.people.map((x) => (
              <button key={x.key} type="button" className={`chip-btn${p.personKey === x.key ? ' is-on' : ''}`} onClick={() => p.setPersonKey(x.key)}>
                {x.emoji} {x.name}
              </button>
            ))}
          </div>
          <div className="segmented">
            <button type="button" className={p.paidBy === 'me' ? 'is-on' : ''} onClick={() => p.setPaidBy('me')}>
              Pagué yo
            </button>
            <button type="button" className={p.paidBy === 'them' ? 'is-on' : ''} onClick={() => p.setPaidBy('them')}>
              Pagó {person?.name ?? 'la otra persona'}
            </button>
          </div>
          <label className="field">
            <span>Mi parte</span>
            <div className="chips">
              <input inputMode="decimal" className="chip-input wide" value={p.myPartText} onChange={(e) => p.setMyPartText(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
              {p.amount && (
                <>
                  <button type="button" className="chip-btn" onClick={() => p.setMyPartText(amountToInput(Math.round(p.amount! / 2)))}>
                    Mitad
                  </button>
                  <button type="button" className="chip-btn" onClick={() => p.setMyPartText('0')}>
                    Nada (fue todo suyo)
                  </button>
                </>
              )}
            </div>
          </label>
          {p.amount && myPart !== null && myPart <= p.amount && person && (
            <p className="hint">
              {p.paidBy === 'me'
                ? `${person.name} te va a deber ${formatMoney(p.amount - myPart, p.currency)}. En tus gastos del mes cuenta solo tu parte.`
                : `Le vas a deber ${formatMoney(myPart, p.currency)} a ${person.name}. No sale plata de tus cuentas hasta que le pagues.`}
            </p>
          )}
          {p.amount && myPart !== null && myPart > p.amount && <p className="form-error">Tu parte no puede ser más que el total.</p>}
        </>
      )}
    </fieldset>
  );
}

/** Cargar escribiendo ("café 2500 mp") o con la foto del ticket. */
function QuickEntry({ ai, onDraft }: { ai: AiStatus; onDraft: (d: MovementDraft, ai: AiStatus) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'texto' | 'foto' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (kind: 'texto' | 'foto', fn: () => Promise<{ draft: MovementDraft; ai: AiStatus }>) => {
    setBusy(kind);
    setError(null);
    try {
      const out = await fn();
      onDraft(out.draft, out.ai);
      setText('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const sendText = () =>
    text.trim() && run('texto', () => api('/ai/parse', { method: 'POST', body: { text: text.trim(), today: localDate() } }));

  const sendPhoto = (file: File) =>
    run('foto', async () => {
      const { base64 } = await preparePhoto(file, 1400);
      return api('/ai/ticket', { method: 'POST', body: { image: base64, mediaType: 'image/jpeg', today: localDate() } });
    });

  return (
    <div className="quick">
      <div className="quick-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void sendText()}
          placeholder="Escribilo: café 2500 mp"
          maxLength={300}
          disabled={!!busy || ai.remaining <= 0}
          aria-label="Cargar escribiendo"
        />
        <button type="button" className="quick-btn" onClick={() => void sendText()} disabled={!text.trim() || !!busy || ai.remaining <= 0} aria-label="Completar con IA">
          {busy === 'texto' ? '…' : '✨'}
        </button>
        <button type="button" className="quick-btn" onClick={() => fileRef.current?.click()} disabled={!!busy || ai.remaining <= 0} aria-label="Foto del ticket">
          {busy === 'foto' ? '…' : '📷'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void sendPhoto(f);
          }}
        />
      </div>
      {busy === 'foto' && <p className="hint">Leyendo el ticket…</p>}
      {ai.remaining <= 0 && <p className="hint">Por hoy ya se usaron todas las consultas a la IA. Cargalo a mano.</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
