<template>
  <div class="sidebar">
    <div class="sidebar__logo">
      BudgetTracker
    </div>
    <nav class="sidebar__navigation">
      <router-link
        to="/"
        class="sidebar__navigation-link"
      >
        Dashboard
      </router-link>
      <router-link
        to="/accounts"
        class="sidebar__navigation-link"
      >
        Accounts
      </router-link>
      <router-link
        to="/settings"
        class="sidebar__navigation-link"
      >
        Settings
      </router-link>
    </nav>
  </div>
</template>

<script>
export default {

};
</script>

<style lang="scss" scoped>
.sidebar {
  padding: 24px 24px;
  background-color: #fff;
  z-index: 1;
}
.sidebar__logo {
  font-size: 24px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-align: center;
  margin-bottom: 80px;
}
.sidebar__navigation-link {
  font-size: 16px;
  letter-spacing: 0.5px;
  font-weight: 400;
  display: block;
  margin-bottom: 32px;
}
</style>
