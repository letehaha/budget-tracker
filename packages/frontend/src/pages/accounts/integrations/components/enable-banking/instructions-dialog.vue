<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto">
      <DialogHeader class="mb-4">
        <DialogTitle>How to Obtain Enable Banking Credentials</DialogTitle>
        <DialogDescription class="sr-only">
          Step-by-step instructions for registering and configuring Enable Banking credentials
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 text-sm">
        <div>
          <h3 class="mb-2 text-base font-semibold">Overview</h3>
          <p class="text-muted-foreground">
            Enable Banking requires you to register an application and generate security credentials to access banking
            data. Follow these steps to get your Application ID and Private Key.
          </p>
        </div>

        <div class="space-y-2">
          <!-- Step 1: Register & Create Application -->
          <Collapsible v-slot="{ open: isOpen }" :default-open="true" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                1
              </div>
              <span class="flex-1 font-semibold">Register & Create Application</span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground space-y-2 border-t px-3 py-3 pl-12">
                <p>
                  Visit
                  <ExternalLink href="https://enablebanking.com" text="enablebanking.com" />
                  and create an account if you don't have one already.
                </p>
                <p class="text-foreground pt-2 font-medium">Then create an application:</p>
                <div class="space-y-1">
                  <div>1. Log in to the Enable Banking portal</div>
                  <div>2. Navigate to <ExternalLink href="https://enablebanking.com/cp/applications" /></div>
                  <div>3. Look at the "Create Application" form</div>
                  <div>4. Select <strong>"Production"</strong> environment</div>
                  <div>
                    5. Check the <strong>"Generate private RSA key in the browser"</strong> checkbox. Once application
                    is created, the .pem key will be saved to your computer automatically as a file.
                    <strong>If file was not saved</strong> for whatever reason – you will need to recreate the
                    application
                  </div>
                  <div>
                    6. Fill out form with the next values:
                    <div class="mt-2 flex flex-col gap-1 pl-4">
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Application name: </span>
                        <ClickToCopy class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]" value="Own testing" />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Allowed redirect URLs: </span>
                        <ClickToCopy
                          class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]"
                          value="https://moneymatter.app/bank-callback https://moneymatter.app/bank-callback"
                        />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Application description: </span>
                        <ClickToCopy class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]" value="testing" />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Email for data protection matters: </span>
                        <ClickToCopy class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]" value="test@gmail.com" />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Privacy URL: </span>
                        <ClickToCopy
                          class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]"
                          value="https://moneymatter.app/privacy-policy"
                        />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Terms URL: </span>
                        <ClickToCopy
                          class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]"
                          value="https://moneymatter.app/terms-of-use"
                        />
                      </div>
                    </div>
                  </div>
                  <div>7. Click "Register"</div>
                  <div>
                    8. You will be suggested to download a file. It's your RSA key that you must save somewhere since
                    this is part of your credentials
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Step 2: Link Your Bank Accounts -->
          <Collapsible v-slot="{ open: isOpen }" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                2
              </div>
              <span class="flex-1 font-semibold">Link Your Bank Accounts</span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground border-t px-3 py-3 pl-12 flex flex-col gap-1">
                <p>
                  Before using the application with MoneyMatter, you must first link your bank accounts through the
                  Enable Banking portal. Look for the "Link accounts" button inside the created application's tile and
                  follow all the steps required there.
                </p>
                <p>Here's the details breakdown:</p>
                <p>1. Click "Link accounts", wait for spinner to finish loading</p>
                <p>
                  2. New fields will appear in the same spot: "Country", "ASPSP", "Usage type"

                  <ul class="pl-4 flex flex-col gap-1 mt-1">
                    <li>2.1 Country: <span class="font-semibold dark:text-white">Your bank's country</span></li>
                    <li>2.2 ASPSP: <span class="font-semibold dark:text-white">Your bank name</span></li>
                    <li>2.3 Usage type: <span class="font-semibold dark:text-white">Private</span></li>
                    <li>2.4 Click "Save"</li>
                  </ul>
                </p>
                <p>3. You will be redirected to your banks' auth page. Login, and select all the accounts you want to connect</p>
                <p>4. Once you finish auth flow, you will be redirected back to EnableBanking</p>
                <p>5. Wait until selected accounts are displayed in the Application's card under "Linked accounts" field</p>

                <div class="border p-3 mb-3 rounded border-warning-border bg-warning-muted text-warning-muted-foreground">
                  <TriangleAlertIcon class="size-5 inline" />

                  It might be the case that some selected accounts are not linked. This is the problem on your bank's side which you cannot
                  resolve by yourself. You can only wait a few hours/days until issue is resolved. If issue is not resolved, the only way is
                  to report to EnableBanking.
                </div>

                <div class="border rounded border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100">
                  <InfoIcon class="size-5 inline" />

                  In case in the future you would like to connect more accounts, you will need to repeat the flow of linking accounts again.
                  <strong>Keep in mind</strong> that when adding NEW accounts you still need to select OLD accounts – basically you need to
                  select ALL accounts you want to be connected.
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Step 3: Get Your Credentials -->
          <Collapsible v-slot="{ open: isOpen }" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                3
              </div>
              <span class="flex-1 font-semibold">Get Your Credentials</span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground border-t px-3 py-3 pl-12">
                <p class="mb-2">From the Enable Banking portal:</p>
                <ul class="list-inside list-disc space-y-1">
                  <li>
                    <strong>Application ID:</strong> Copy the <code class="bg-muted rounded px-1">app_id</code> from
                    your application details
                    <br />
                    Example: <code class="bg-muted rounded px-1"> 0f711c28-1682-27b5-946c-e221168abf79 </code>
                  </li>
                  <li>
                    <strong>Private Key:</strong> Open your saved
                    <code class="bg-muted rounded px-1">private.pem</code> file via some text editor (TextEdit on MacOS
                    or Notepad on Windows) and copy its entire content (including the BEGIN and END lines)
                  </li>
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div class="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <div class="flex gap-2">
            <InfoIcon class="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p class="mb-1 font-semibold text-blue-900 dark:text-blue-100">Security Note</p>
              <p class="text-xs text-blue-800 dark:text-blue-200">
                Your private key is stored encrypted in our database and is only used to authenticate with Enable
                Banking on your behalf. Token is limited to read-only data. Yet, never share your private key with
                anyone else.
              </p>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="mt-6">
        <UiButton @click="$emit('update:open', false)">Got it</UiButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import ClickToCopy from '@/components/common/click-to-copy.vue';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import { ChevronDownIcon, InfoIcon, TriangleAlertIcon } from 'lucide-vue-next';

defineProps<{
  open: boolean;
}>();

defineEmits<{
  'update:open': [value: boolean];
}>();
</script>
