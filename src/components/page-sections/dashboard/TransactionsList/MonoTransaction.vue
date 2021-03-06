<template>
  <div
    class="transaction"
    :class="`transaction--${txType.name.toLowerCase()}`"
    @click="editTransaction"
  >
    <div class="transaction__info">
      <div class="transaction__category">
        {{ category.name }}
      </div>
      <div class="transaction__note">
        {{ tx.description }}
      </div>
    </div>
    <div class="transaction__right">
      <div class="transaction__amount">
        {{ tx.formattedAmount }}
        <!-- {{ tx.account.currency.asset }} -->
      </div>
      <div class="transaction__time">
        {{ formateDate(tx.time) }}
      </div>
    </div>
  </div>
</template>

<script>
import { format } from 'date-fns';
import { TRANSACTIONS_TYPES } from '@/js/const';
import { mapGetters } from 'vuex';
import { indexVuexTypes, categoriesVuexTypes } from '@/store';
import { MODAL_TYPES } from '@/components/Modal';

export default {
  props: {
    tx: { type: Object, required: true },
  },
  computed: {
    ...mapGetters({
      getTxTypeById: indexVuexTypes.GET_TRANSACTION_TYPE_BY_ID,
    }),
    ...mapGetters('categories', {
      categoryById: categoriesVuexTypes.GET_CATEGORY_BY_ID,
    }),
    txType() {
      return this.getTxTypeById(this.tx.transactionTypeId);
    },
    category() {
      return this.categoryById(this.tx.categoryId);
    },
  },
  methods: {
    formateDate(date) {
      return format(new Date(date), 'd MMMM y');
    },
    editTransaction() {
      this.$bus.emit(this.$bus.eventsList.modalOpen, {
        type: MODAL_TYPES.monobankTxForm,
        data: { transaction: this.tx },
      });
    },
    amountFormatter(amount, type) {
      switch (type) {
        case (TRANSACTIONS_TYPES.expense):
          return `-${amount}`;
        case (TRANSACTIONS_TYPES.income):
          return `+${amount}`;
        case (TRANSACTIONS_TYPES.transfer):
          return amount;
        default:
          return amount;
      }
    },
    getCategoryName() {},
  },
};
</script>

<style lang="scss" scoped>
.transaction {
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  cursor: pointer;
}
.transaction__category {
  font-size: 16px;
  white-space: nowrap;
  letter-spacing: 0.5px;
  color: #333;
}
.transaction__note {
  color: #666;
  font-size: 14px;
  letter-spacing: 0.5px;
}
.transaction__amount {
  text-align: right;

  .transaction--income & {
    color: #2ecc71;
  }
  .transaction--expense & {
    color: #e74c3c;
  }
  .transaction--transfer & {
    color: #34495e;
  }
}
</style>
