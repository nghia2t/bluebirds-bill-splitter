<script setup lang="ts">
// Preconnect to Google Fonts once at the document root so Plus Jakarta Sans
// and the Material Symbols Outlined font land without a flash of fallback.
const { locale } = useI18n()
useHead({
  htmlAttrs: { lang: locale },
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
  ],
  meta: [
    // Match the MD3 surface — cool blue-grey light wash and deep cool slate dark.
    // Lets iOS/Android chrome blend into the page surface.
    { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#f8f9ff' },
    { name: 'theme-color', media: '(prefers-color-scheme: dark)',  content: '#0b1620' },
  ],
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppToast />
  </UApp>
</template>
