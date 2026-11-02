// 门户身份档案(个人资料)是各署个人信息的唯一来源:
// 真实姓名(displayName,不可自行修改)、邮箱(email)、地址(address)。
// 各署申请表单从这里取值预填;档案里为空的字段才允许申请人手动填写。
export function profileIdentity(user) {
  return {
    realName: String(user?.displayName || '').trim(),
    email: String(user?.email || '').trim(),
    address: String(user?.address || '').trim(),
  };
}
