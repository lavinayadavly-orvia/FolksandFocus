import {guardSocialRecords} from './social-identity.mjs';
export const SOCIAL_PLATFORMS=["Instagram","YouTube","X","LinkedIn"];

export function buildSocialMonitor(accounts,posts,people){
  const guarded=guardSocialRecords(accounts,posts,people);
  accounts=guarded.accounts;posts=guarded.posts;
  const personById=new Map(people.map(person=>[person.id,person]));
  const accountById=new Map(accounts.map(account=>[account.id,account]));
  const resolvedAccounts=accounts.map(account=>({...account,hcp:personById.get(account.hcpId)?.name||"Unresolved identity",postCount:posts.filter(post=>post.accountId===account.id).length}));
  const resolvedPosts=posts.map(post=>({...post,hcp:personById.get(post.hcpId)?.name||"Unresolved identity",handle:accountById.get(post.accountId)?.handle||"Unresolved account"}));
  const platformSummary=SOCIAL_PLATFORMS.map(platform=>({platform,accounts:accounts.filter(account=>account.platform===platform).length,posts:posts.filter(post=>post.platform===platform).length,lastCheckedAt:accounts.filter(account=>account.platform===platform).map(account=>account.lastCheckedAt).sort().at(-1)||null,status:accounts.some(account=>account.platform===platform&&account.collectionStatus==="PUBLIC_OBSERVATION")?"PUBLIC_OBSERVATION":"CONNECTOR_REQUIRED"}));
  return {generatedAt:new Date().toISOString(),quality:{review:guarded.review,duplicates:guarded.duplicates},platformSummary,accounts:resolvedAccounts,posts:resolvedPosts,method:"Only identity-resolved accounts and source-linked posts are included. Metrics are timestamped observations, not live totals."};
}
